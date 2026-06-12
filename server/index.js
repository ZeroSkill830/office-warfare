// Office Warfare — server autoritativo (Socket.io)
// Il server decide danni, morti, respawn, pickup, squadre, bandiere e fine
// partita; i client inviano posizione/rotazione e segnalano i colpi, che
// vengono validati qui. Ogni modalità (dm/tdm/ctf) è una stanza separata
// con la propria istanza di Game.

import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import { Server } from 'socket.io'
import {
  WEAPONS, PICKUPS, SPAWN_POINTS, MODES, FLAG_BASES, FLAG_RADIUS, FLAG_RETURN_MS,
  WEAPON_RESPAWN_MS, ITEM_RESPAWN_MS, RESPAWN_DELAY_MS,
  PICKUP_RADIUS, MEDKIT_HEAL,
} from './data.js'

const PORT = process.env.PORT || 3001
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Personaggi: ogni cartella in client/public/assets/players con un player.glb
// è un personaggio selezionabile (il nome della cartella è l'id).
const PLAYERS_DIR = path.join(__dirname, '../client/public/assets/players')
function scanCharacters() {
  try {
    return fs.readdirSync(PLAYERS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(PLAYERS_DIR, d.name, 'player.glb')))
      .map(d => d.name)
      .sort()
  } catch {
    return []
  }
}
const CHARACTERS = scanCharacters()
if (CHARACTERS.length === 0) console.warn('Nessun modello in', PLAYERS_DIR)
// Override per i test (limiti più bassi = partite verificabili in pochi secondi)
const SCORE_LIMIT = process.env.SCORE_LIMIT ? Number(process.env.SCORE_LIMIT) : null
const TIME_LIMIT = process.env.TIME_LIMIT ? Number(process.env.TIME_LIMIT) : null
const INTERMISSION_MS = process.env.INTERMISSION_MS ? Number(process.env.INTERMISSION_MS) : 8000

const app = express()
// In produzione serve la build del client (client/dist), se presente.
app.use(express.static(path.join(__dirname, '../client/dist')))

// ---------- Leaderboard persistente (per nickname, globale tra le modalità) ----------
const LB_FILE = process.env.LB_FILE || path.join(__dirname, 'leaderboard.json')
let leaderboard = {}
try { leaderboard = JSON.parse(fs.readFileSync(LB_FILE, 'utf8')) } catch { /* primo avvio */ }
let lbSaveTimer = null
function lbRecord(nick, field) {
  const entry = leaderboard[nick] ??= { kills: 0, deaths: 0 }
  entry[field]++
  clearTimeout(lbSaveTimer)
  lbSaveTimer = setTimeout(() => {
    fs.writeFile(LB_FILE, JSON.stringify(leaderboard, null, 1), () => {})
  }, 1000)
}
app.get('/leaderboard', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  const top = Object.entries(leaderboard)
    .map(([nick, s]) => ({ nick, kills: s.kills, deaths: s.deaths }))
    .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
    .slice(0, 10)
  res.json(top)
})

app.get('/characters', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.json(CHARACTERS)
})

const httpServer = http.createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })

function dist2(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2]
  return dx * dx + dy * dy + dz * dz
}

// ---------- Una partita = una modalità = una stanza Socket.io ----------
class Game {
  constructor(mode) {
    this.mode = mode
    this.cfg = MODES[mode]
    this.scoreLimit = SCORE_LIMIT || this.cfg.scoreLimit
    this.timeLimit = (TIME_LIMIT || this.cfg.timeLimit) * 1000
    this.players = new Map()
    this.pickups = new Map()
    for (const p of PICKUPS) this.pickups.set(p.id, { ...p, active: true, timer: null })
    this.drops = new Map()
    this.dropCounter = 0
    this.teamScores = { a: 0, b: 0 }
    this.flags = mode === 'ctf'
      ? {
          a: { team: 'a', state: 'base', pos: [...FLAG_BASES.a], carrier: null, returnTimer: null },
          b: { team: 'b', state: 'base', pos: [...FLAG_BASES.b], carrier: null, returnTimer: null },
        }
      : null
    this.state = 'playing'
    this.endsAt = Date.now() + this.timeLimit
  }

  get teamMode() { return this.mode !== 'dm' }
  emit(ev, data) { io.to(this.mode).emit(ev, data) }
  timeLeft() { return Math.max(0, Math.round((this.endsAt - Date.now()) / 1000)) }

  scores() {
    return [...this.players.values()].map(p =>
      ({ id: p.id, nick: p.nick, team: p.team, kills: p.kills, deaths: p.deaths }))
  }

  publicPlayer(p) {
    return {
      id: p.id, nick: p.nick, char: p.char, team: p.team, hp: p.hp, alive: p.alive,
      pos: p.pos, rot: p.rot, weapon: p.weapon, kills: p.kills, deaths: p.deaths,
    }
  }

  publicFlags() {
    if (!this.flags) return null
    return ['a', 'b'].map(t => {
      const f = this.flags[t]
      return { team: f.team, state: f.state, pos: f.pos, carrier: f.carrier }
    })
  }

  pickTeam() {
    let a = 0, b = 0
    for (const p of this.players.values()) p.team === 'a' ? a++ : b++
    return a <= b ? 'a' : 'b'
  }

  pickSpawn(team) {
    // Nelle modalità a squadre si spawna nella propria metà campo (a: z<0)
    let candidates = SPAWN_POINTS
    if (this.teamMode && team) {
      candidates = SPAWN_POINTS.filter(sp => (team === 'a' ? sp[2] < 0 : sp[2] > 0))
    }
    const enemies = [...this.players.values()].filter(p => p.alive && (!this.teamMode || p.team !== team))
    let best = candidates[Math.floor(Math.random() * candidates.length)]
    let bestScore = -1
    for (const sp of candidates) {
      let minD = Infinity
      for (const p of enemies) minD = Math.min(minD, dist2(sp, p.pos))
      const score = enemies.length ? minD : Math.random()
      if (score > bestScore) { bestScore = score; best = sp }
    }
    return [...best]
  }

  addPlayer(socket, { nick, char }) {
    const team = this.teamMode ? this.pickTeam() : null
    const player = {
      id: socket.id,
      nick: String(nick || 'Stagista').slice(0, 16) || 'Stagista',
      char: CHARACTERS.includes(char) ? char : CHARACTERS[0],
      team,
      hp: 100,
      alive: true,
      pos: this.pickSpawn(team),
      rot: [0, 0],
      weapon: 'mouse',
      kills: 0,
      deaths: 0,
      shots: new Map(), // shotId -> { weapon, hits, t } per validare i colpi
      respawnTimer: null,
    }
    this.players.set(socket.id, player)
    socket.join(this.mode)
    socket.emit('init', {
      id: socket.id,
      mode: this.mode,
      modeLabel: this.cfg.label,
      scoreLimit: this.scoreLimit,
      team,
      timeLeft: this.timeLeft(),
      teamScores: this.teamScores,
      flags: this.publicFlags(),
      players: [...this.players.values()].map(p => this.publicPlayer(p)),
      pickups: [...this.pickups.values()].map(p => ({ id: p.id, type: p.type, weapon: p.weapon, pos: p.pos, active: p.active })),
      drops: [...this.drops.values()],
      scores: this.scores(),
    })
    socket.to(this.mode).emit('playerJoined', this.publicPlayer(player))
    this.emit('scores', this.scores())
    console.log(`+ ${player.nick} (${socket.id}) [${this.mode}${team ? '/' + team : ''}] — ${this.players.size} in partita`)
  }

  removePlayer(socket) {
    const p = this.players.get(socket.id)
    if (!p) return
    clearTimeout(p.respawnTimer)
    this.dropFlagOf(p)
    this.players.delete(socket.id)
    this.emit('playerLeft', { id: socket.id })
    this.emit('scores', this.scores())
    console.log(`- ${p.nick} (${socket.id}) [${this.mode}] — ${this.players.size} in partita`)
  }

  spawnDrop(weapon, pos) {
    const drop = { id: 'd' + (++this.dropCounter), weapon, pos: [...pos] }
    this.drops.set(drop.id, drop)
    this.emit('dropSpawned', drop)
    // I drop non raccolti spariscono dopo 60s per non accumulare oggetti
    setTimeout(() => {
      if (this.drops.delete(drop.id)) this.emit('dropTaken', { id: drop.id, by: null })
    }, 60000)
  }

  killPlayer(victim, killerId, weapon) {
    victim.alive = false
    victim.hp = 0
    victim.deaths++
    lbRecord(victim.nick, 'deaths')
    const killer = this.players.get(killerId)
    if (killer && killer.id !== victim.id) {
      killer.kills++
      lbRecord(killer.nick, 'kills')
      if (this.mode === 'tdm' && killer.team) {
        this.teamScores[killer.team]++
        this.emit('teamScores', this.teamScores)
      }
    }
    this.dropFlagOf(victim)
    if (victim.weapon && victim.weapon !== 'mouse') {
      this.spawnDrop(victim.weapon, [victim.pos[0], victim.pos[1] + 1, victim.pos[2]])
    }
    this.emit('death', { id: victim.id, killerId, weapon })
    this.emit('scores', this.scores())
    victim.respawnTimer = setTimeout(() => {
      if (!this.players.has(victim.id) || this.state !== 'playing') return
      this.respawn(victim)
    }, RESPAWN_DELAY_MS)
    this.checkWin()
  }

  respawn(p) {
    p.alive = true
    p.hp = 100
    p.weapon = 'mouse'
    p.pos = this.pickSpawn(p.team)
    this.emit('respawned', { id: p.id, pos: p.pos, hp: p.hp })
  }

  // ---------- CTF ----------
  flagEvent(f) {
    this.emit('flag', { team: f.team, state: f.state, pos: f.pos, carrier: f.carrier })
  }

  dropFlagOf(p) {
    if (!this.flags) return
    for (const t of ['a', 'b']) {
      const f = this.flags[t]
      if (f.carrier !== p.id) continue
      f.carrier = null
      f.state = 'dropped'
      f.pos = [p.pos[0], 0, p.pos[2]]
      f.returnTimer = setTimeout(() => this.resetFlag(f, true), FLAG_RETURN_MS)
      this.flagEvent(f)
    }
  }

  resetFlag(f, announce = false) {
    clearTimeout(f.returnTimer)
    f.returnTimer = null
    f.carrier = null
    f.state = 'base'
    f.pos = [...FLAG_BASES[f.team]]
    if (announce) this.flagEvent(f)
  }

  // Chiamato a 20 Hz: prese, recuperi e catture in base alle posizioni
  tickFlags() {
    if (!this.flags || this.state !== 'playing') return
    const r2 = FLAG_RADIUS * FLAG_RADIUS
    for (const p of this.players.values()) {
      if (!p.alive || !p.team) continue
      const enemyFlag = this.flags[p.team === 'a' ? 'b' : 'a']
      const ownFlag = this.flags[p.team]

      // Presa della bandiera nemica (alla base o a terra)
      if (enemyFlag.state !== 'carried' && dist2(p.pos, enemyFlag.pos) < r2) {
        clearTimeout(enemyFlag.returnTimer)
        enemyFlag.returnTimer = null
        enemyFlag.state = 'carried'
        enemyFlag.carrier = p.id
        this.flagEvent(enemyFlag)
      }

      // Recupero della propria bandiera caduta
      if (ownFlag.state === 'dropped' && dist2(p.pos, ownFlag.pos) < r2) {
        this.resetFlag(ownFlag, true)
      }

      // Cattura: portatore alla propria base, con la propria bandiera al suo posto
      if (enemyFlag.carrier === p.id && ownFlag.state === 'base'
          && dist2(p.pos, FLAG_BASES[p.team]) < r2) {
        this.resetFlag(enemyFlag, true)
        this.teamScores[p.team]++
        this.emit('flagScored', { team: p.team, by: p.id, nick: p.nick })
        this.emit('teamScores', this.teamScores)
        this.checkWin()
      }
    }
  }

  // ---------- Ciclo di partita ----------
  checkWin() {
    if (this.state !== 'playing') return
    if (this.teamMode) {
      for (const t of ['a', 'b']) {
        if (this.teamScores[t] >= this.scoreLimit) return this.endMatch({ team: t })
      }
    } else {
      for (const p of this.players.values()) {
        if (p.kills >= this.scoreLimit) return this.endMatch({ id: p.id, nick: p.nick })
      }
    }
  }

  // Chiamato a 1 Hz
  tickClock() {
    if (this.state !== 'playing' || this.players.size === 0) return
    if (Date.now() >= this.endsAt) {
      // Tempo scaduto: vince chi è in vantaggio (null = pareggio)
      if (this.teamMode) {
        const { a, b } = this.teamScores
        this.endMatch(a !== b ? { team: a > b ? 'a' : 'b' } : null)
      } else {
        const sorted = this.scores().sort((x, y) => y.kills - x.kills)
        const top = sorted[0]
        const tie = sorted.length > 1 && sorted[1].kills === top?.kills
        this.endMatch(top && !tie ? { id: top.id, nick: top.nick } : null)
      }
      return
    }
    this.emit('clock', { t: this.timeLeft() })
  }

  endMatch(winner) {
    this.state = 'ended'
    this.emit('matchEnd', {
      mode: this.mode,
      winner,
      scores: this.scores(),
      teamScores: this.teamScores,
    })
    setTimeout(() => this.resetMatch(), INTERMISSION_MS)
  }

  resetMatch() {
    this.teamScores = { a: 0, b: 0 }
    if (this.flags) for (const t of ['a', 'b']) this.resetFlag(this.flags[t])
    for (const item of this.pickups.values()) {
      clearTimeout(item.timer)
      item.timer = null
      item.active = true
    }
    this.drops.clear()
    this.state = 'playing'
    this.endsAt = Date.now() + this.timeLimit
    this.emit('matchStart', { timeLeft: this.timeLeft(), teamScores: this.teamScores, flags: this.publicFlags() })
    for (const p of this.players.values()) {
      clearTimeout(p.respawnTimer)
      p.kills = 0
      p.deaths = 0
      this.respawn(p)
    }
    this.emit('scores', this.scores())
  }

  // ---------- Handler degli eventi di gioco ----------
  onState(socket, s) {
    const p = this.players.get(socket.id)
    if (!p || !Array.isArray(s.p)) return
    p.pos = s.p
    p.rot = s.r || p.rot
    if (typeof s.w === 'string' && WEAPONS[s.w]) p.weapon = s.w
  }

  onShoot(socket, s) {
    const p = this.players.get(socket.id)
    if (!p || !p.alive || !WEAPONS[s.weapon] || this.state !== 'playing') return
    p.shots.set(s.shotId, { weapon: s.weapon, hits: 0, t: Date.now() })
    if (p.shots.size > 40) {
      const cutoff = Date.now() - 4000
      for (const [id, shot] of p.shots) if (shot.t < cutoff) p.shots.delete(id)
    }
    socket.to(this.mode).emit('shot', { shooterId: socket.id, weapon: s.weapon, origin: s.origin, dirs: s.dirs })
  }

  onHit(socket, { targetId, weapon, shotId, scale }) {
    if (this.state !== 'playing') return
    const shooter = this.players.get(socket.id)
    const target = this.players.get(targetId)
    if (!shooter || !target || !shooter.alive || !target.alive) return
    // Fuoco amico disattivato nelle modalità a squadre
    if (this.teamMode && shooter.team === target.team && shooter.id !== target.id) return
    const def = WEAPONS[weapon]
    if (!def) return
    const shot = shooter.shots.get(shotId)
    if (!shot || shot.weapon !== weapon || Date.now() - shot.t > 4000) return
    if (shot.hits >= def.pellets) return
    shot.hits++
    const dmg = Math.max(1, Math.round(def.damage * Math.min(1, Math.max(0, scale ?? 1))))
    target.hp -= dmg
    if (target.hp <= 0) {
      this.killPlayer(target, socket.id, weapon)
    } else {
      this.emit('damaged', { id: target.id, hp: target.hp, by: socket.id })
    }
  }

  onPickup(socket, { id }) {
    const p = this.players.get(socket.id)
    const item = this.pickups.get(id)
    if (!p || !p.alive || !item || !item.active) return
    if (dist2(p.pos, item.pos) > PICKUP_RADIUS * PICKUP_RADIUS) return
    item.active = false
    if (item.type === 'medkit') p.hp = Math.min(100, p.hp + MEDKIT_HEAL)
    if (item.type === 'weapon') p.weapon = item.weapon
    this.emit('pickupTaken', { id, by: socket.id, type: item.type, weapon: item.weapon, hp: p.hp })
    const respawnMs = item.type === 'weapon' ? WEAPON_RESPAWN_MS : ITEM_RESPAWN_MS
    item.timer = setTimeout(() => {
      item.active = true
      this.emit('pickupRespawned', { id })
    }, respawnMs)
  }

  onPickupDrop(socket, { id }) {
    const p = this.players.get(socket.id)
    const drop = this.drops.get(id)
    if (!p || !p.alive || !drop) return
    if (dist2(p.pos, drop.pos) > PICKUP_RADIUS * PICKUP_RADIUS) return
    this.drops.delete(id)
    p.weapon = drop.weapon
    this.emit('dropTaken', { id, by: socket.id, weapon: drop.weapon })
  }

  onDropWeapon(socket, { weapon }) {
    const p = this.players.get(socket.id)
    if (!p || !p.alive || !WEAPONS[weapon] || weapon === 'mouse') return
    this.spawnDrop(weapon, [p.pos[0], p.pos[1] + 1, p.pos[2]])
  }

  broadcastStates() {
    if (this.players.size === 0) return
    const states = {}
    for (const p of this.players.values()) states[p.id] = { p: p.pos, r: p.rot, w: p.weapon }
    this.emit('states', states)
  }
}

const games = { dm: new Game('dm'), tdm: new Game('tdm'), ctf: new Game('ctf') }

// Stato delle stanze per il menu del client
app.get('/info', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  const out = {}
  for (const [mode, g] of Object.entries(games)) {
    out[mode] = { label: g.cfg.label, players: g.players.size, scoreLimit: g.scoreLimit }
  }
  res.json(out)
})

io.on('connection', (socket) => {
  socket.on('join', ({ nick, char, mode }) => {
    if (socket.data.game) return // già in partita
    const game = games[mode] || games.dm
    socket.data.game = game
    game.addPlayer(socket, { nick, char })
  })

  const route = (ev, method) => socket.on(ev, (payload) =>
    socket.data.game?.[method](socket, payload ?? {}))
  route('state', 'onState')
  route('shoot', 'onShoot')
  route('hit', 'onHit')
  route('pickup', 'onPickup')
  route('pickupDrop', 'onPickupDrop')
  route('dropWeapon', 'onDropWeapon')

  socket.on('disconnect', () => {
    socket.data.game?.removePlayer(socket)
    socket.data.game = null
  })
})

// Broadcast degli stati e logica bandiere a 20 Hz, orologio a 1 Hz
setInterval(() => {
  for (const g of Object.values(games)) {
    g.broadcastStates()
    g.tickFlags()
  }
}, 50)
setInterval(() => {
  for (const g of Object.values(games)) g.tickClock()
}, 1000)

httpServer.listen(PORT, () => {
  console.log(`Office Warfare server in ascolto su http://0.0.0.0:${PORT}`)
})

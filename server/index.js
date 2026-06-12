// Office Warfare — server autoritativo (Socket.io)
// Free roam: un'unica stanza per tutti, senza squadre, timer o fine partita.
// Il server decide danni, morti, respawn e pickup; i client inviano
// posizione/rotazione e segnalano i colpi, che vengono validati qui.

import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import { Server } from 'socket.io'
import {
  WEAPONS, PICKUPS, SPAWN_POINTS,
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

const app = express()
// In produzione serve la build del client (client/dist), se presente.
app.use(express.static(path.join(__dirname, '../client/dist')))

// ---------- Leaderboard persistente (per nickname) ----------
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

// ---------- Stato di gioco (un'unica stanza) ----------
const players = new Map()
const pickups = new Map()
for (const p of PICKUPS) pickups.set(p.id, { ...p, active: true, timer: null })
const drops = new Map()
let dropCounter = 0

function scores() {
  return [...players.values()].map(p =>
    ({ id: p.id, nick: p.nick, kills: p.kills, deaths: p.deaths }))
}

function publicPlayer(p) {
  return {
    id: p.id, nick: p.nick, char: p.char, hp: p.hp, alive: p.alive,
    pos: p.pos, rot: p.rot, weapon: p.weapon, kills: p.kills, deaths: p.deaths,
  }
}

// Spawn più lontano possibile dagli altri giocatori vivi
function pickSpawn(selfId) {
  const others = [...players.values()].filter(p => p.alive && p.id !== selfId)
  let best = SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)]
  let bestScore = -1
  for (const sp of SPAWN_POINTS) {
    let minD = Infinity
    for (const p of others) minD = Math.min(minD, dist2(sp, p.pos))
    const score = others.length ? minD : Math.random()
    if (score > bestScore) { bestScore = score; best = sp }
  }
  return [...best]
}

function addPlayer(socket, { nick, char }) {
  const player = {
    id: socket.id,
    nick: String(nick || 'Stagista').slice(0, 16) || 'Stagista',
    char: CHARACTERS.includes(char) ? char : CHARACTERS[0],
    hp: 100,
    alive: true,
    pos: pickSpawn(socket.id),
    rot: [0, 0],
    weapon: 'mouse',
    kills: 0,
    deaths: 0,
    shots: new Map(), // shotId -> { weapon, hits, t } per validare i colpi
    respawnTimer: null,
  }
  players.set(socket.id, player)
  socket.emit('init', {
    id: socket.id,
    players: [...players.values()].map(p => publicPlayer(p)),
    pickups: [...pickups.values()].map(p => ({ id: p.id, type: p.type, weapon: p.weapon, pos: p.pos, active: p.active })),
    drops: [...drops.values()],
    scores: scores(),
  })
  socket.broadcast.emit('playerJoined', publicPlayer(player))
  io.emit('scores', scores())
  console.log(`+ ${player.nick} (${socket.id}) — ${players.size} in ufficio`)
}

function removePlayer(socket) {
  const p = players.get(socket.id)
  if (!p) return
  clearTimeout(p.respawnTimer)
  players.delete(socket.id)
  io.emit('playerLeft', { id: socket.id })
  io.emit('scores', scores())
  console.log(`- ${p.nick} (${socket.id}) — ${players.size} in ufficio`)
}

function spawnDrop(weapon, pos) {
  const drop = { id: 'd' + (++dropCounter), weapon, pos: [...pos] }
  drops.set(drop.id, drop)
  io.emit('dropSpawned', drop)
  // I drop non raccolti spariscono dopo 60s per non accumulare oggetti
  setTimeout(() => {
    if (drops.delete(drop.id)) io.emit('dropTaken', { id: drop.id, by: null })
  }, 60000)
}

function killPlayer(victim, killerId, weapon) {
  victim.alive = false
  victim.hp = 0
  victim.deaths++
  lbRecord(victim.nick, 'deaths')
  const killer = players.get(killerId)
  if (killer && killer.id !== victim.id) {
    killer.kills++
    lbRecord(killer.nick, 'kills')
  }
  if (victim.weapon && victim.weapon !== 'mouse') {
    spawnDrop(victim.weapon, [victim.pos[0], victim.pos[1] + 1, victim.pos[2]])
  }
  io.emit('death', { id: victim.id, killerId, weapon })
  io.emit('scores', scores())
  victim.respawnTimer = setTimeout(() => {
    if (!players.has(victim.id)) return
    victim.alive = true
    victim.hp = 100
    victim.weapon = 'mouse'
    victim.pos = pickSpawn(victim.id)
    io.emit('respawned', { id: victim.id, pos: victim.pos, hp: victim.hp })
  }, RESPAWN_DELAY_MS)
}

io.on('connection', (socket) => {
  socket.on('join', ({ nick, char }) => {
    if (players.has(socket.id)) return // già in partita
    addPlayer(socket, { nick, char })
  })

  socket.on('state', (s) => {
    const p = players.get(socket.id)
    if (!p || !Array.isArray(s.p)) return
    p.pos = s.p
    p.rot = s.r || p.rot
    if (typeof s.w === 'string' && WEAPONS[s.w]) p.weapon = s.w
  })

  socket.on('shoot', (s) => {
    const p = players.get(socket.id)
    if (!p || !p.alive || !WEAPONS[s.weapon]) return
    p.shots.set(s.shotId, { weapon: s.weapon, hits: 0, t: Date.now() })
    if (p.shots.size > 40) {
      const cutoff = Date.now() - 4000
      for (const [id, shot] of p.shots) if (shot.t < cutoff) p.shots.delete(id)
    }
    socket.broadcast.emit('shot', { shooterId: socket.id, weapon: s.weapon, origin: s.origin, dirs: s.dirs })
  })

  socket.on('hit', ({ targetId, weapon, shotId, scale }) => {
    const shooter = players.get(socket.id)
    const target = players.get(targetId)
    if (!shooter || !target || !shooter.alive || !target.alive) return
    const def = WEAPONS[weapon]
    if (!def) return
    const shot = shooter.shots.get(shotId)
    if (!shot || shot.weapon !== weapon || Date.now() - shot.t > 4000) return
    if (shot.hits >= def.pellets) return
    shot.hits++
    const dmg = Math.max(1, Math.round(def.damage * Math.min(1, Math.max(0, scale ?? 1))))
    target.hp -= dmg
    if (target.hp <= 0) {
      killPlayer(target, socket.id, weapon)
    } else {
      io.emit('damaged', { id: target.id, hp: target.hp, by: socket.id })
    }
  })

  socket.on('pickup', ({ id } = {}) => {
    const p = players.get(socket.id)
    const item = pickups.get(id)
    if (!p || !p.alive || !item || !item.active) return
    if (dist2(p.pos, item.pos) > PICKUP_RADIUS * PICKUP_RADIUS) return
    item.active = false
    if (item.type === 'medkit') p.hp = Math.min(100, p.hp + MEDKIT_HEAL)
    if (item.type === 'weapon') p.weapon = item.weapon
    io.emit('pickupTaken', { id, by: socket.id, type: item.type, weapon: item.weapon, hp: p.hp })
    const respawnMs = item.type === 'weapon' ? WEAPON_RESPAWN_MS : ITEM_RESPAWN_MS
    item.timer = setTimeout(() => {
      item.active = true
      io.emit('pickupRespawned', { id })
    }, respawnMs)
  })

  socket.on('pickupDrop', ({ id } = {}) => {
    const p = players.get(socket.id)
    const drop = drops.get(id)
    if (!p || !p.alive || !drop) return
    if (dist2(p.pos, drop.pos) > PICKUP_RADIUS * PICKUP_RADIUS) return
    drops.delete(id)
    p.weapon = drop.weapon
    io.emit('dropTaken', { id, by: socket.id, weapon: drop.weapon })
  })

  socket.on('dropWeapon', ({ weapon } = {}) => {
    const p = players.get(socket.id)
    if (!p || !p.alive || !WEAPONS[weapon] || weapon === 'mouse') return
    spawnDrop(weapon, [p.pos[0], p.pos[1] + 1, p.pos[2]])
  })

  socket.on('disconnect', () => removePlayer(socket))
})

// Giocatori online per il menu del client
app.get('/info', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.json({ players: players.size })
})

// Broadcast degli stati a 20 Hz
setInterval(() => {
  if (players.size === 0) return
  const states = {}
  for (const p of players.values()) states[p.id] = { p: p.pos, r: p.rot, w: p.weapon }
  io.emit('states', states)
}, 50)

httpServer.listen(PORT, () => {
  console.log(`Office Warfare server in ascolto su http://0.0.0.0:${PORT}`)
})

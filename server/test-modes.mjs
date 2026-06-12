// Test di integrazione delle modalità: avvia un server dedicato (porta 3102,
// limiti ridotti via env) e verifica squadre, fuoco amico, punteggi di squadra,
// fine/riavvio partita (TDM) e presa/cattura della bandiera (CTF).
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { io } from 'socket.io-client'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = 3102
const URL = `http://localhost:${PORT}`

const results = []
const check = (name, ok) => {
  results.push([name, ok])
  console.log(`${ok ? '✓' : '✗'} ${name}`)
}
const wait = (ms) => new Promise(r => setTimeout(r, ms))
const once = (sock, ev, timeout = 5000, filter = () => true) => new Promise((resolve, reject) => {
  const t = setTimeout(() => { sock.off(ev, h); reject(new Error(`timeout su "${ev}"`)) }, timeout)
  const h = (data) => {
    if (!filter(data)) return
    clearTimeout(t); sock.off(ev, h); resolve(data)
  }
  sock.on(ev, h)
})
const join = async (nick, mode) => {
  const s = io(URL, { transports: ['websocket'] })
  await once(s, 'connect')
  s.emit('join', { nick, char: 'pier', mode })
  const init = await once(s, 'init')
  return { s, init }
}
// 4 colpi di mouse (25 dmg) = kill; ogni hit richiede uno sparo registrato
const killWith = async (shooter, targetId, prefix) => {
  for (let i = 1; i <= 4; i++) {
    const shotId = prefix + i
    shooter.emit('shoot', { weapon: 'mouse', origin: [0, 1.6, 0], dirs: [[0, 0, -1]], shotId })
    shooter.emit('hit', { targetId, weapon: 'mouse', shotId, scale: 1 })
    await wait(60)
  }
}

// Server dedicato con partite "corte" per testare il ciclo completo
const server = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
  env: {
    ...process.env,
    PORT: String(PORT),
    SCORE_LIMIT: '2',
    INTERMISSION_MS: '1500',
    TIME_LIMIT: '300',
    LB_FILE: '/tmp/ow-test-modes-lb.json',
  },
  stdio: 'ignore',
})
await wait(1200)

const sockets = []
try {
  // ---------- TDM: squadre e fuoco amico ----------
  const A = await join('Alice', 'tdm')
  const B = await join('Bob', 'tdm')
  const C = await join('Carla', 'tdm')
  sockets.push(A.s, B.s, C.s)
  check('TDM: squadre alternate bilanciate',
    A.init.team === 'a' && B.init.team === 'b' && C.init.team === 'a')
  check('TDM: init contiene modalità e punteggi squadra',
    A.init.mode === 'tdm' && A.init.teamScores && typeof A.init.timeLeft === 'number')

  // Fuoco amico (Carla → Alice, stessa squadra): nessun danno
  let friendlyDamage = false
  const ffListener = (d) => { if (d.id === A.s.id) friendlyDamage = true }
  C.s.on('damaged', ffListener)
  await killWith(C.s, A.s.id, 'ff')
  await wait(400)
  C.s.off('damaged', ffListener)
  check('TDM: fuoco amico ignorato dal server', !friendlyDamage)

  // Alice (a) uccide Bob (b): kill valida + punto squadra
  const teamScoresSeen = once(A.s, 'teamScores', 5000, (s) => s.a >= 1)
  const deathSeen = once(A.s, 'death')
  await killWith(A.s, B.s.id, 'k1-')
  const death1 = await deathSeen
  const ts1 = await teamScoresSeen
  check('TDM: kill nemica applicata', death1.id === B.s.id && death1.killerId === A.s.id)
  check('TDM: punto alla squadra del killer', ts1.a === 1)

  // Seconda kill → SCORE_LIMIT=2 → fine partita, poi nuova partita
  await once(B.s, 'respawned', 5000, (r) => r.id === B.s.id)
  await wait(200)
  const endSeen = once(A.s, 'matchEnd', 6000)
  await killWith(A.s, B.s.id, 'k2-')
  const end = await endSeen
  check('TDM: la partita finisce al limite di punteggio', end.winner?.team === 'a' && end.teamScores.a === 2)
  const start = await once(A.s, 'matchStart', 5000)
  const freshScores = await once(A.s, 'scores', 3000)
  check('TDM: nuova partita con punteggi azzerati',
    start.teamScores.a === 0 && freshScores.every(p => p.kills === 0 && p.deaths === 0))

  // ---------- CTF: presa e cattura della bandiera ----------
  const D = await join('Dora', 'ctf')
  const E = await join('Enea', 'ctf')
  sockets.push(D.s, E.s)
  check('CTF: init contiene le bandiere',
    Array.isArray(D.init.flags) && D.init.flags.length === 2 && D.init.flags.every(f => f.state === 'base'))

  // Enea (team b) va alla base della bandiera A (z=-20.5) e la prende
  const flagTaken = once(E.s, 'flag', 4000, (f) => f.team === 'a' && f.state === 'carried')
  E.s.emit('state', { p: [0, 1, -20.5], r: [0, 0], w: 'mouse' })
  const taken = await flagTaken
  check('CTF: bandiera nemica presa avvicinandosi', taken.carrier === E.s.id)

  // Porta la bandiera alla propria base (z=+20.5) → cattura
  const scored = once(E.s, 'flagScored', 4000)
  const ctfScores = once(E.s, 'teamScores', 4000, (s) => s.b >= 1)
  const flagHome = once(D.s, 'flag', 4000, (f) => f.team === 'a' && f.state === 'base')
  E.s.emit('state', { p: [0, 1, 20.5], r: [0, 0], w: 'mouse' })
  const sc = await scored
  const ts2 = await ctfScores
  check('CTF: cattura alla propria base', sc.team === 'b' && sc.by === E.s.id && ts2.b === 1)

  // La bandiera catturata torna alla base
  const backHome = await flagHome.catch(() => null)
  check('CTF: bandiera tornata alla base dopo la cattura', backHome !== null)

  // ---------- /info ----------
  const info = await (await fetch(URL + '/info')).json()
  check('/info riporta i giocatori per stanza', info.tdm.players === 3 && info.ctf.players === 2 && info.dm.players === 0)

} catch (err) {
  console.error('ERRORE:', err.message)
  results.push(['(eccezione)', false])
}

for (const s of sockets) s.close()
server.kill()
const failed = results.filter(([, ok]) => !ok)
console.log(failed.length === 0 ? '\nTUTTI I TEST MODALITÀ PASSATI' : `\n${failed.length} TEST FALLITI`)
process.exit(failed.length === 0 ? 0 : 1)

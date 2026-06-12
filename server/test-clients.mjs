// Test di integrazione: due client si connettono, si vedono a vicenda,
// uno spara e colpisce l'altro fino all'uccisione, poi verifica respawn,
// drop dell'arma e pickup. Esce con codice 0 se tutto funziona.
import { io } from 'socket.io-client'

const URL = process.env.TEST_URL || 'http://localhost:3001'
const results = []
const check = (name, ok) => {
  results.push([name, ok])
  console.log(`${ok ? '✓' : '✗'} ${name}`)
}
const wait = (ms) => new Promise(r => setTimeout(r, ms))
const once = (sock, ev, timeout = 5000) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`timeout su "${ev}"`)), timeout)
  sock.once(ev, (data) => { clearTimeout(t); resolve(data) })
})

const a = io(URL, { transports: ['websocket'] })
const b = io(URL, { transports: ['websocket'] })

try {
  await Promise.all([once(a, 'connect'), once(b, 'connect')])
  check('Due client connessi simultaneamente', true)

  a.emit('join', { nick: 'Alice', char: 'manager' })
  const initA = await once(a, 'init')
  check('Client A riceve init con pickups e spawn', initA.pickups.length > 0 && Array.isArray(initA.players))

  const joinedPromise = once(a, 'playerJoined')
  b.emit('join', { nick: 'Bob', char: 'char-non-valido' })
  const initB = await once(b, 'init')
  const joined = await joinedPromise
  check('Client A vede entrare Bob', joined.nick === 'Bob')
  check('Client B vede Alice in partita', initB.players.some(p => p.nick === 'Alice'))
  check('Personaggio propagato (e char non valido sostituito)',
    initB.players.find(p => p.nick === 'Alice')?.char === 'manager' && joined.char === 'impiegato')

  // Stato sincronizzato a 20 Hz
  a.emit('state', { p: [1, 1, 1], r: [0, 0], w: 'mouse' })
  const states = await once(b, 'states')
  check('Broadcast degli stati ricevuto da B', states[a.id] !== undefined)

  // Bob si avvicina a un pickup (keyboard a [6.2, 1.05, -17.3]) e lo raccoglie
  b.emit('state', { p: [6.2, 1, -17.3], r: [0, 0], w: 'mouse' })
  await wait(100)
  b.emit('pickup', { id: 'w1' })
  const taken = await once(a, 'pickupTaken')
  check('Pickup arma validato dal server (vicinanza)', taken.id === 'w1' && taken.by === b.id)

  // Pickup troppo lontano: deve essere rifiutato (nessun pickupTaken per w8)
  await wait(300)
  let farTaken = false
  const farListener = (data) => { if (data.id === 'w8') farTaken = true }
  b.on('pickupTaken', farListener)
  b.emit('pickup', { id: 'w8' })
  await wait(600)
  b.off('pickupTaken', farListener)
  check('Pickup lontano rifiutato dal server', !farTaken)

  // Alice spara e colpisce Bob: 4 colpi di mouse (25 dmg) = kill
  // Bob impugnava la tastiera: alla morte deve cadere a terra
  const shotSeen = once(b, 'shot')
  const deathSeen = once(a, 'death')
  const dropSeen = once(a, 'dropSpawned')
  b.emit('state', { p: [6.2, 1, -17.3], r: [0, 0], w: 'keyboard' })
  await wait(100)
  for (let i = 1; i <= 4; i++) {
    a.emit('shoot', { weapon: 'mouse', origin: [0, 1.6, 0], dirs: [[0, 0, -1]], shotId: 't' + i })
    a.emit('hit', { targetId: b.id, weapon: 'mouse', shotId: 't' + i, scale: 1 })
    await wait(50)
  }
  check('B vede i proiettili di A (relay shot)', (await shotSeen).shooterId === a.id)
  const death = await deathSeen
  check('Il server applica i danni e dichiara la morte', death.id === b.id && death.killerId === a.id)
  const drop = await dropSeen.catch(() => null)
  check('L\'arma del morto cade a terra (drop)', drop !== null && drop.weapon === 'keyboard')

  // Colpo senza "shoot" registrato: deve essere ignorato
  a.emit('hit', { targetId: b.id, weapon: 'tproll', shotId: 'fake', scale: 1 })
  let cheated = false
  try { await once(a, 'damaged', 600); cheated = true } catch {}
  check('Colpo non registrato (cheat) ignorato', !cheated)

  const respawn = await once(b, 'respawned', 5000)
  check('Respawn dopo ~3 secondi con 100 hp', respawn.id === b.id && respawn.hp === 100)

  // Leaderboard persistente: la kill di Alice deve comparire nell'endpoint HTTP
  const lb = await (await fetch(URL + '/leaderboard')).json()
  const alice = lb.find(e => e.nick === 'Alice')
  check('Leaderboard persistente registra la kill', alice !== undefined && alice.kills >= 1)

  // Bob raccoglie il proprio drop
  b.emit('state', { p: drop.pos, r: [0, 0], w: 'mouse' })
  await wait(100)
  b.emit('pickupDrop', { id: drop.id })
  const dropTaken = await once(b, 'dropTaken')
  check('Drop raccolto dal giocatore respawnato', dropTaken.by === b.id && dropTaken.weapon === 'keyboard')

} catch (err) {
  console.error('ERRORE:', err.message)
  results.push(['(eccezione)', false])
}

a.close(); b.close()
const failed = results.filter(([, ok]) => !ok)
console.log(failed.length === 0 ? '\nTUTTI I TEST PASSATI' : `\n${failed.length} TEST FALLITI`)
process.exit(failed.length === 0 ? 0 : 1)

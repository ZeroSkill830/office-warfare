// Livello di rete: connessione Socket.io al server.
// In sviluppo (pagina servita da Vite sulla 5173) il server è sulla porta 3001
// dello stesso host; in produzione il server serve anche la pagina, quindi si
// usa direttamente la stessa origin.

import { io } from 'socket.io-client'

export function serverUrl() {
  return location.port === '5173'
    ? `${location.protocol}//${location.hostname}:3001`
    : location.origin
}

export function connect(nick, char, mode, handlers) {
  const socket = io(serverUrl(), { transports: ['websocket', 'polling'] })

  socket.on('connect', () => socket.emit('join', { nick, char, mode }))
  socket.on('connect_error', (err) => handlers.onError?.(err))

  for (const ev of [
    'init', 'playerJoined', 'playerLeft', 'states', 'shot',
    'damaged', 'death', 'respawned', 'pickupTaken', 'pickupRespawned',
    'dropSpawned', 'dropTaken', 'scores',
    'teamScores', 'clock', 'matchEnd', 'matchStart', 'flag', 'flagScored',
  ]) {
    socket.on(ev, (data) => handlers['on' + ev[0].toUpperCase() + ev.slice(1)]?.(data))
  }

  return {
    socket,
    get id() { return socket.id },
    sendState(p, r, w) { socket.emit('state', { p, r, w }) },
    shoot(payload) { socket.emit('shoot', payload) },
    hit(payload) { socket.emit('hit', payload) },
    pickup(id) { socket.emit('pickup', { id }) },
    pickupDrop(id) { socket.emit('pickupDrop', { id }) },
    dropWeapon(weapon) { socket.emit('dropWeapon', { weapon }) },
  }
}

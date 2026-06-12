// Dati di gioco lato server (autoritativo). Le coordinate dei pickup
// corrispondono alle scrivanie/angoli costruiti in client/src/world.js.

export const WEAPONS = {
  mouse:    { damage: 25, pellets: 1 },
  keyboard: { damage: 12, pellets: 8 },
  stapler:  { damage: 10, pellets: 1 },
  tproll:   { damage: 85, pellets: 12 }, // esplosione: può colpire più giocatori
  pen:      { damage: 40, pellets: 1 },
}

// Modalità di gioco: ogni modalità è una stanza separata sul server.
export const MODES = {
  dm:  { label: 'Deathmatch',       scoreLimit: 20, timeLimit: 480 },
  tdm: { label: 'Team Deathmatch',  scoreLimit: 30, timeLimit: 480 },
  ctf: { label: 'Capture the Flag', scoreLimit: 3,  timeLimit: 600 },
}

// CTF: basi delle bandiere ai due capi del corridoio.
// Lato squadra A = metà z<0, squadra B = metà z>0.
export const FLAG_BASES = { a: [0, 0, -20.5], b: [0, 0, 20.5] }
export const FLAG_RADIUS = 1.8
export const FLAG_RETURN_MS = 25000

export const WEAPON_RESPAWN_MS = 30000
export const ITEM_RESPAWN_MS = 15000
export const RESPAWN_DELAY_MS = 3000
export const PICKUP_RADIUS = 3.5
export const MEDKIT_HEAL = 40

// La mappa: corridoio centrale x in [-3,3], z in [-22,22].
// Stanze a destra (x 3..11) e sinistra (x -11..-3), centri z: -15, -5, 5, 15.
// Le scrivanie "desk1" sono a (±6.2, zc-2.3), le "desk2" a (±9.6, zc+2.3); piano a y 0.78.
export const PICKUPS = [
  // Armi sulle scrivanie e in fondo al corridoio
  { id: 'w1', type: 'weapon', weapon: 'keyboard', pos: [6.2, 1.05, -17.3] },
  { id: 'w2', type: 'weapon', weapon: 'keyboard', pos: [-6.2, 1.05, 2.7] },
  { id: 'w3', type: 'weapon', weapon: 'stapler',  pos: [-9.6, 1.05, -12.7] },
  { id: 'w4', type: 'weapon', weapon: 'stapler',  pos: [9.6, 1.05, 7.3] },
  { id: 'w5', type: 'weapon', weapon: 'pen',      pos: [6.2, 1.05, -7.3] },
  { id: 'w6', type: 'weapon', weapon: 'pen',      pos: [-6.2, 1.05, 12.7] },
  { id: 'w7', type: 'weapon', weapon: 'tproll',   pos: [0, 0.6, -21] },
  { id: 'w8', type: 'weapon', weapon: 'tproll',   pos: [0, 0.6, 21] },
  // Munizioni
  { id: 'a1', type: 'ammo', pos: [9.6, 1.05, -2.7] },
  { id: 'a2', type: 'ammo', pos: [-9.6, 1.05, -2.7] },
  { id: 'a3', type: 'ammo', pos: [9.6, 1.05, 17.3] },
  { id: 'a4', type: 'ammo', pos: [-6.2, 1.05, -17.3] },
  // Medikit negli angoli delle stanze
  { id: 'm1', type: 'medkit', pos: [3.8, 0.45, -18.3] },
  { id: 'm2', type: 'medkit', pos: [-3.8, 0.45, -8.3] },
  { id: 'm3', type: 'medkit', pos: [3.8, 0.45, 1.7] },
  { id: 'm4', type: 'medkit', pos: [-3.8, 0.45, 11.7] },
]

export const SPAWN_POINTS = [
  [7, 1, -15], [-7, 1, -15],
  [7, 1, -5], [-7, 1, -5],
  [7, 1, 5], [-7, 1, 5],
  [7, 1, 15], [-7, 1, 15],
  [0, 1, -10], [0, 1, 10],
]

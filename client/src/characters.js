// Personaggi selezionabili: palette colori + accessori costruiti con
// primitive Three.js. Usati dal menu (selezione) e dagli avatar remoti.

import * as THREE from 'three'

export const CHARACTERS = {
  impiegato: {
    label: 'Impiegato', desc: 'Camicia e cravatta, puntuale al timbro',
    shirt: 0xe8e8e2, legs: 0x3a3f46, accent: 0x2563eb,
    css: '#e8e8e2', cssAccent: '#2563eb',
  },
  manager: {
    label: 'Manager', desc: 'Completo scuro e occhiali, vede i tuoi KPI',
    shirt: 0x22304f, legs: 0x182441, accent: 0xc0392b,
    css: '#22304f', cssAccent: '#c0392b',
  },
  sistemista: {
    label: 'Sistemista IT', desc: 'Maglietta nera e cuffie, hai provato a riavviare?',
    shirt: 0x23262b, legs: 0x2e4a6b, accent: 0x27ae60,
    css: '#23262b', cssAccent: '#27ae60',
  },
  stagista: {
    label: 'Stagista', desc: 'Felpa e cappellino, porta i caffè (esplosivi)',
    shirt: 0xe67e22, legs: 0x39506b, accent: 0xf1c40f,
    css: '#e67e22', cssAccent: '#f1c40f',
  },
}

export const DEFAULT_CHARACTER = 'impiegato'

export function isCharacter(id) {
  return typeof id === 'string' && id in CHARACTERS
}

// Aggiunge gli accessori del personaggio al gruppo dell'avatar.
// Riferimenti: testa centrata a y=1.6 (lato 0.3), busto a y=1.05, fronte = -z.
export function addAccessories(charId, group) {
  const def = CHARACTERS[charId] || CHARACTERS[DEFAULT_CHARACTER]
  const mat = (color) => new THREE.MeshLambertMaterial({ color })
  const accent = mat(def.accent)
  const dark = mat(0x16181c)

  if (charId === 'impiegato' || charId === 'manager') {
    // Cravatta sul petto
    const knot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.03), accent)
    knot.position.set(0, 1.33, -0.16)
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.025), accent)
    tie.position.set(0, 1.13, -0.16)
    group.add(knot, tie)
  }
  if (charId === 'manager') {
    // Occhiali scuri
    const lensL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.02), dark)
    lensL.position.set(-0.075, 1.64, -0.16)
    const lensR = lensL.clone()
    lensR.position.x = 0.075
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), dark)
    bridge.position.set(0, 1.64, -0.16)
    group.add(lensL, lensR, bridge)
  }
  if (charId === 'sistemista') {
    // Cuffie con microfono
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.06), dark)
    band.position.set(0, 1.78, 0)
    const cupL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.12), accent)
    cupL.position.set(-0.18, 1.6, 0)
    const cupR = cupL.clone()
    cupR.position.x = 0.18
    const mic = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.14), dark)
    mic.position.set(-0.12, 1.52, -0.12)
    group.add(band, cupL, cupR, mic)
  }
  if (charId === 'stagista') {
    // Cappellino con visiera
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.08, 0.33), accent)
    cap.position.set(0, 1.79, 0)
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.16), accent)
    visor.position.set(0, 1.76, -0.24)
    group.add(cap, visor)
  }
}

// Bandiere CTF: asta + telo colorato per squadra, base circolare fissa.
// Lo stato arriva dal server (eventi 'flag'); se portata, la bandiera segue
// il portatore (avatar remoto o giocatore locale).

import * as THREE from 'three'

export const TEAM_COLORS = { a: 0x2563eb, b: 0xc0392b }
export const TEAM_LABELS = { a: 'Blu', b: 'Rossi' }

function makeFlagMesh(team) {
  const g = new THREE.Group()
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, 1.9, 8),
    new THREE.MeshLambertMaterial({ color: 0x55585c }),
  )
  pole.position.y = 0.95
  const cloth = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.45, 0.04),
    new THREE.MeshLambertMaterial({ color: TEAM_COLORS[team], emissive: TEAM_COLORS[team], emissiveIntensity: 0.35 }),
  )
  cloth.position.set(0.38, 1.62, 0)
  g.add(pole, cloth)
  return g
}

function makeBaseMesh(team) {
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.85, 0.06, 24),
    new THREE.MeshLambertMaterial({ color: TEAM_COLORS[team], emissive: TEAM_COLORS[team], emissiveIntensity: 0.25 }),
  )
  disc.position.y = 0.03
  return disc
}

export class Flags {
  constructor(scene) {
    this.scene = scene
    this.map = new Map() // team -> { mesh, base, state, pos, carrier }
  }

  init(list) {
    this.clear()
    if (!list) return
    for (const f of list) {
      const mesh = makeFlagMesh(f.team)
      const base = makeBaseMesh(f.team)
      base.position.set(f.pos[0], 0.03, f.pos[2])
      this.scene.add(mesh, base)
      this.map.set(f.team, { mesh, base, state: 'base', pos: [...f.pos], carrier: null })
      this.set(f)
    }
  }

  clear() {
    for (const f of this.map.values()) this.scene.remove(f.mesh, f.base)
    this.map.clear()
  }

  set({ team, state, pos, carrier }) {
    const f = this.map.get(team)
    if (!f) return
    f.state = state
    f.pos = [...pos]
    f.carrier = carrier
    if (state !== 'carried') f.mesh.position.set(pos[0], 0, pos[2])
  }

  carrierOf(team) { return this.map.get(team)?.carrier ?? null }

  update(dt, remotes, myId, myPos) {
    for (const f of this.map.values()) {
      if (f.state === 'carried') {
        // La bandiera segue il portatore, leggermente arretrata e in alto
        if (f.carrier === myId) {
          f.mesh.position.set(myPos.x, myPos.y + 0.3, myPos.z)
        } else {
          const a = remotes.map.get(f.carrier)
          if (a) f.mesh.position.set(a.group.position.x, a.group.position.y + 0.3, a.group.position.z)
        }
        f.mesh.rotation.y += dt * 2
      } else {
        f.mesh.rotation.y += dt * (f.state === 'dropped' ? 3 : 0.8)
      }
    }
  }
}

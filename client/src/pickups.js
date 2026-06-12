// Pickup di armi/munizioni/medikit (fluttuano e ruotano) e armi droppate
// alla morte (corpi fisici che cadono e rimbalzano sul pavimento/scrivanie).

import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { makeWeaponMesh, WEAPONS } from './weapons.js'
import { GROUP } from './world.js'

function makeItemMesh(item) {
  if (item.type === 'weapon') {
    const g = makeWeaponMesh(item.weapon)
    g.scale.setScalar(1.6)
    return g
  }
  const g = new THREE.Group()
  if (item.type === 'medkit') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.26),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }))
    const crossMat = new THREE.MeshLambertMaterial({ color: 0xe53935 })
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.02), crossMat)
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.02), crossMat)
    c1.position.z = 0.14; c2.position.z = 0.14
    g.add(box, c1, c2)
  } else { // ammo
    const mat = new THREE.MeshLambertMaterial({ color: 0xd4a017 })
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.18), mat)
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.14),
      new THREE.MeshLambertMaterial({ color: 0x8a6914 }))
    b2.position.y = 0.13
    g.add(b1, b2)
  }
  return g
}

export function labelOf(item) {
  if (item.type === 'medkit') return 'Medikit'
  if (item.type === 'ammo') return 'Munizioni'
  return `${WEAPONS[item.weapon].label} (${WEAPONS[item.weapon].cls})`
}

export class Pickups {
  constructor(scene, physics) {
    this.scene = scene
    this.physics = physics
    this.items = new Map() // pickup fissi: id -> { data, mesh, active }
    this.drops = new Map() // armi droppate: id -> { data, mesh, body }
    this.t = 0
  }

  init(list) {
    for (const item of this.items.values()) this.scene.remove(item.mesh)
    this.items.clear()
    for (const data of list) {
      const mesh = makeItemMesh(data)
      mesh.position.set(data.pos[0], data.pos[1], data.pos[2])
      this.scene.add(mesh)
      mesh.visible = data.active !== false
      this.items.set(data.id, { data, mesh, active: data.active !== false })
    }
  }

  setActive(id, active) {
    const item = this.items.get(id)
    if (!item) return
    item.active = active
    item.mesh.visible = active
  }

  addDrop(data) {
    if (this.drops.has(data.id)) return
    const mesh = makeWeaponMesh(data.weapon)
    mesh.scale.setScalar(1.6)
    this.scene.add(mesh)
    const body = new CANNON.Body({
      mass: 1,
      shape: new CANNON.Sphere(0.15),
      position: new CANNON.Vec3(data.pos[0], data.pos[1], data.pos[2]),
      collisionFilterGroup: GROUP.DEBRIS,
      collisionFilterMask: GROUP.WORLD | GROUP.PROP,
      linearDamping: 0.3,
      angularDamping: 0.5,
    })
    body.velocity.set((Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2)
    body.allowSleep = true
    body.sleepSpeedLimit = 0.2
    this.physics.addBody(body)
    this.drops.set(data.id, { data, mesh, body })
  }

  removeDrop(id) {
    const d = this.drops.get(id)
    if (!d) return
    this.scene.remove(d.mesh)
    this.physics.removeBody(d.body)
    this.drops.delete(id)
  }

  update(dt) {
    this.t += dt
    // I pickup fissi fluttuano e ruotano per essere visibili
    for (const item of this.items.values()) {
      if (!item.active) continue
      item.mesh.rotation.y += dt * 1.5
      item.mesh.position.y = item.data.pos[1] + Math.sin(this.t * 2 + item.data.pos[0]) * 0.08
    }
    // Le armi droppate seguono il loro corpo fisico
    for (const d of this.drops.values()) {
      d.mesh.position.copy(d.body.position)
      d.mesh.quaternion.copy(d.body.quaternion)
    }
  }

  // Pickup o drop più vicino entro il raggio di raccolta
  nearest(pos, radius = 2.2) {
    let best = null, bestD = radius * radius
    for (const item of this.items.values()) {
      if (!item.active) continue
      const dx = pos.x - item.data.pos[0], dy = pos.y + 1 - item.data.pos[1], dz = pos.z - item.data.pos[2]
      const d = dx * dx + dy * dy + dz * dz
      if (d < bestD) { bestD = d; best = { kind: 'pickup', id: item.data.id, data: item.data } }
    }
    for (const d of this.drops.values()) {
      const dx = pos.x - d.body.position.x, dy = pos.y + 0.5 - d.body.position.y, dz = pos.z - d.body.position.z
      const dist = dx * dx + dy * dy + dz * dz
      if (dist < bestD) { bestD = dist; best = { kind: 'drop', id: d.data.id, data: { type: 'weapon', weapon: d.data.weapon } } }
    }
    return best
  }
}

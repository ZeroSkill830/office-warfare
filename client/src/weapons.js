// Definizione delle armi "office warfare", gestione di sparo/ricarica/slot
// e modello in prima persona (viewmodel) costruito con primitive Three.js.

import * as THREE from 'three'

export const WEAPONS = {
  mouse: {
    label: 'Mouse', cls: 'Pistola', icon: '🖱️',
    damage: 25, fireRate: 340, mag: 12, reserve: 60, reload: 1.1,
    speed: 55, pellets: 1, spread: 0.012, gravity: 3, push: 4,
  },
  keyboard: {
    label: 'Tastiera', cls: 'Fucile a pompa', icon: '⌨️',
    damage: 12, fireRate: 950, mag: 6, reserve: 24, reload: 2.3,
    speed: 42, pellets: 8, spread: 0.09, gravity: 8, push: 2,
  },
  stapler: {
    label: 'Graffettatrice', cls: 'Mitragliatrice', icon: '📎',
    damage: 10, fireRate: 95, mag: 30, reserve: 90, reload: 1.8,
    speed: 85, pellets: 1, spread: 0.035, gravity: 1.2, push: 2,
  },
  tproll: {
    label: 'Rotolo di carta', cls: 'Lanciagranate', icon: '🧻',
    damage: 85, fireRate: 1300, mag: 3, reserve: 9, reload: 2.6,
    speed: 17, pellets: 1, spread: 0, gravity: 0, push: 0,
    explosive: true, radius: 4.5, fuse: 1.8,
  },
  pen: {
    label: 'Penna', cls: 'Coltello da lancio', icon: '🖊️',
    damage: 40, fireRate: 750, mag: 5, reserve: 15, reload: 1.6,
    speed: 32, pellets: 1, spread: 0.004, gravity: 9.8, push: 6,
  },
}

// Mesh in miniatura di un'arma, usata per viewmodel, pickup e avatar remoti
export function makeWeaponMesh(type) {
  const g = new THREE.Group()
  const lambert = (color, emissive = 0) => new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: 0.4 })
  if (type === 'mouse') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.2), lambert(0xb9bec4))
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.02, 8), lambert(0x333333))
    wheel.rotation.z = Math.PI / 2
    wheel.position.set(0, 0.04, -0.05)
    g.add(body, wheel)
  } else if (type === 'keyboard') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.045, 0.17), lambert(0x2b2e33))
    g.add(base)
    for (let i = 0; i < 5; i++) {
      const key = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.07), lambert(0xd8dce0))
      key.position.set(-0.18 + i * 0.09, 0.032, (i % 2 ? 0.035 : -0.035))
      g.add(key)
    }
  } else if (type === 'stapler') {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.045, 0.07), lambert(0x55585c))
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.065), lambert(0xc0392b))
    top.position.set(-0.01, 0.06, 0)
    top.rotation.z = 0.08
    g.add(base, top)
  } else if (type === 'tproll') {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.11, 14), lambert(0xf2f2ee))
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.115, 10), lambert(0x8a7b66))
    roll.rotation.z = Math.PI / 2
    hole.rotation.z = Math.PI / 2
    g.add(roll, hole)
  } else if (type === 'pen') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.17, 8), lambert(0x1f5fd6))
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.03, 8), lambert(0x222222))
    shaft.rotation.x = Math.PI / 2
    tip.rotation.x = -Math.PI / 2
    tip.position.z = -0.1
    g.add(shaft, tip)
  }
  return g
}

export class WeaponSystem {
  constructor(camera, { onFire, onReloadStart, onChanged }) {
    this.camera = camera
    this.onFire = onFire
    this.onReloadStart = onReloadStart
    this.onChanged = onChanged

    this.slots = { 1: this._makeSlot('mouse'), 2: null }
    this.current = 1
    this.triggerDown = false
    this.cooldown = 0
    this.reloading = 0
    this.shotCounter = 0

    // Viewmodel agganciato alla camera
    this.viewRoot = new THREE.Group()
    this.viewRoot.position.set(0.32, -0.3, -0.55)
    camera.add(this.viewRoot)
    this.viewMesh = null
    this.recoil = 0
    this._rebuildViewModel()
  }

  _makeSlot(type) {
    const def = WEAPONS[type]
    return { type, ammo: def.mag, reserve: def.reserve }
  }

  get slot() { return this.slots[this.current] }
  get def() { return WEAPONS[this.slot.type] }

  _rebuildViewModel() {
    if (this.viewMesh) this.viewRoot.remove(this.viewMesh)
    this.viewMesh = makeWeaponMesh(this.slot.type)
    this.viewMesh.scale.setScalar(1.4)
    this.viewRoot.add(this.viewMesh)
    this.onChanged?.(this)
  }

  switchTo(n) {
    if (n === this.current || !this.slots[n]) return
    this.current = n
    this.reloading = 0
    this.cooldown = Math.max(this.cooldown, 0.25)
    this._rebuildViewModel()
  }

  // Raccoglie un'arma nello slot 2; ritorna l'eventuale arma scambiata
  giveSpecial(type) {
    const old = this.slots[2]?.type ?? null
    this.slots[2] = this._makeSlot(type)
    this.current = 2
    this.reloading = 0
    this._rebuildViewModel()
    return old
  }

  addAmmo() {
    const s1 = this.slots[1]
    s1.reserve = Math.min(240, s1.reserve + WEAPONS[s1.type].mag * 2)
    if (this.slots[2]) {
      const s2 = this.slots[2]
      s2.reserve = Math.min(240, s2.reserve + WEAPONS[s2.type].mag * 2)
    }
    this.onChanged?.(this)
  }

  // Ritorna alle condizioni iniziali (dopo il respawn)
  reset() {
    this.slots = { 1: this._makeSlot('mouse'), 2: null }
    this.current = 1
    this.reloading = 0
    this.cooldown = 0
    this._rebuildViewModel()
  }

  reload() {
    const s = this.slot, def = this.def
    if (this.reloading > 0 || s.ammo >= def.mag || s.reserve <= 0) return
    this.reloading = def.reload
    this.onReloadStart?.(def.reload)
    this.onChanged?.(this)
  }

  _fire() {
    const s = this.slot, def = this.def
    if (s.ammo <= 0) {
      this.reload()
      return
    }
    s.ammo--
    this.cooldown = def.fireRate / 1000
    this.recoil = 1

    // Direzioni dei proiettili (rosa di pallini per la tastiera)
    const dir = new THREE.Vector3()
    this.camera.getWorldDirection(dir)
    const dirs = []
    for (let i = 0; i < def.pellets; i++) {
      const d = dir.clone()
      if (def.spread > 0) {
        d.x += (Math.random() - 0.5) * 2 * def.spread
        d.y += (Math.random() - 0.5) * 2 * def.spread
        d.z += (Math.random() - 0.5) * 2 * def.spread
        d.normalize()
      }
      dirs.push([d.x, d.y, d.z])
    }
    const origin = new THREE.Vector3()
    this.camera.getWorldPosition(origin)
    origin.addScaledVector(dir, 0.4)

    const shotId = 's' + (++this.shotCounter)
    this.onFire({ weapon: s.type, origin: [origin.x, origin.y, origin.z], dirs, shotId })
    this.onChanged?.(this)
  }

  update(dt, canShoot) {
    this.cooldown = Math.max(0, this.cooldown - dt)
    if (this.reloading > 0) {
      this.reloading -= dt
      if (this.reloading <= 0) {
        this.reloading = 0
        const s = this.slot, def = this.def
        const take = Math.min(def.mag - s.ammo, s.reserve)
        s.ammo += take
        s.reserve -= take
        this.onChanged?.(this)
      }
    }
    if (this.triggerDown && canShoot && this.cooldown === 0 && this.reloading === 0) {
      this._fire()
    }
    // Animazione di rinculo / ricarica del viewmodel
    this.recoil = Math.max(0, this.recoil - dt * 7)
    const r = this.recoil
    const reloadDip = this.reloading > 0 ? 0.22 : 0
    this.viewRoot.position.z = -0.55 + r * 0.1
    this.viewRoot.position.y = -0.3 - reloadDip
    this.viewRoot.rotation.x = r * 0.25 - reloadDip * 1.2
  }
}

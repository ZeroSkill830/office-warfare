// Proiettili con traiettorie fisiche reali.
// - Pallini/graffette/tasti/penne: integrazione balistica (gravità per arma) +
//   raycast cannon-es contro la mappa e test segmento-AABB contro i giocatori.
// - Rotolo di carta igienica: corpo rigido cannon-es che vola ad arco, rimbalza
//   e esplode ad area, spingendo via gli oggetti dinamici.

import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { WEAPONS } from './weapons.js'
import { GROUP } from './world.js'

function makeBulletMesh(weapon) {
  if (weapon === 'keyboard') { // tasto di tastiera
    return new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.025, 0.06),
      new THREE.MeshBasicMaterial({ color: 0xe8ecf0 }))
  }
  if (weapon === 'stapler') { // graffetta
    return new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.09),
      new THREE.MeshBasicMaterial({ color: 0xd0d4d8 }))
  }
  if (weapon === 'pen') { // penna
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.18, 6),
      new THREE.MeshBasicMaterial({ color: 0x1f5fd6 }))
    m.rotation.x = Math.PI / 2
    const g = new THREE.Group()
    g.add(m)
    return g
  }
  // pistola (mouse): piccolo tracciante
  return new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4),
    new THREE.MeshBasicMaterial({ color: 0xffe082 }))
}

// Intersezione segmento p0->p1 con AABB; ritorna t in [0,1] o -1
function segmentVsBox(p0, p1, min, max) {
  let tmin = 0, tmax = 1
  for (const a of ['x', 'y', 'z']) {
    const d = p1[a] - p0[a]
    if (Math.abs(d) < 1e-9) {
      if (p0[a] < min[a] || p0[a] > max[a]) return -1
      continue
    }
    let t1 = (min[a] - p0[a]) / d
    let t2 = (max[a] - p0[a]) / d
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp }
    tmin = Math.max(tmin, t1)
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return -1
  }
  return tmin
}

export class Projectiles {
  /**
   * @param {object} opts { scene, physics, bounceMat, getTargets, onHitPlayer, onExplosion, audio }
   * getTargets() -> [{ id, min:Vector3, max:Vector3, center:Vector3 }]
   */
  constructor(opts) {
    Object.assign(this, opts)
    this.bullets = []
    this.grenades = []
    this.effects = []
    this._ray = new CANNON.RaycastResult()
  }

  spawn({ weapon, origin, dirs, shotId, local }) {
    const def = WEAPONS[weapon]
    for (const d of dirs) {
      if (def.explosive) {
        this._spawnGrenade(weapon, origin, d, shotId, local)
      } else {
        const mesh = makeBulletMesh(weapon)
        mesh.position.set(origin[0], origin[1], origin[2])
        this.scene.add(mesh)
        this.bullets.push({
          weapon, shotId, local,
          pos: new THREE.Vector3(...origin),
          vel: new THREE.Vector3(...d).multiplyScalar(def.speed),
          gravity: def.gravity,
          mesh,
          ttl: 3,
        })
      }
    }
  }

  _spawnGrenade(weapon, origin, dir, shotId, local) {
    const def = WEAPONS[weapon]
    const mesh = new THREE.Group()
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.11, 12),
      new THREE.MeshLambertMaterial({ color: 0xf5f5f0 }))
    const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.115, 8),
      new THREE.MeshLambertMaterial({ color: 0x8a7b66 }))
    mesh.add(roll, hole)
    mesh.position.set(origin[0], origin[1], origin[2])
    this.scene.add(mesh)

    const body = new CANNON.Body({
      mass: 0.8,
      shape: new CANNON.Sphere(0.12),
      position: new CANNON.Vec3(origin[0], origin[1], origin[2]),
      material: this.bounceMat,
      collisionFilterGroup: GROUP.DEBRIS,
      collisionFilterMask: GROUP.WORLD | GROUP.PROP,
      angularDamping: 0.2,
    })
    body.velocity.set(dir[0] * def.speed, dir[1] * def.speed + 2, dir[2] * def.speed)
    body.angularVelocity.set(Math.random() * 8, Math.random() * 8, Math.random() * 8)
    this.physics.addBody(body)
    this.grenades.push({ weapon, shotId, local, body, mesh, fuse: def.fuse })
  }

  _impactPuff(pos, color = 0xcccccc) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }))
    m.position.copy(pos)
    this.scene.add(m)
    this.effects.push({ mesh: m, ttl: 0.18, grow: 3 })
  }

  _explode(g) {
    const def = WEAPONS[g.weapon]
    const pos = new THREE.Vector3().copy(g.body.position)

    // Effetto visivo: sfera che si espande + lampo di luce
    const fire = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.95 }))
    fire.position.copy(pos)
    this.scene.add(fire)
    this.effects.push({ mesh: fire, ttl: 0.35, grow: 16 })
    const flash = new THREE.PointLight(0xffaa55, 60, def.radius * 3, 1.6)
    flash.position.copy(pos)
    this.scene.add(flash)
    this.effects.push({ light: flash, ttl: 0.25 })

    // Spinta fisica sugli oggetti dinamici vicini
    for (const body of this.physics.bodies) {
      if (body.type !== CANNON.Body.DYNAMIC || body === g.body) continue
      const d = body.position.distanceTo(g.body.position)
      if (d < def.radius) {
        const imp = new CANNON.Vec3(
          body.position.x - g.body.position.x,
          body.position.y - g.body.position.y + 0.5,
          body.position.z - g.body.position.z,
        )
        imp.normalize()
        imp.scale(35 * (1 - d / def.radius), imp)
        body.wakeUp()
        body.applyImpulse(imp, body.position)
      }
    }

    // Danno ad area: solo il client che ha sparato lo segnala al server
    if (g.local) {
      for (const t of this.getTargets(true)) {
        const d = t.center.distanceTo(pos)
        if (d < def.radius) {
          this.onHitPlayer({ targetId: t.id, weapon: g.weapon, shotId: g.shotId, scale: 1 - d / def.radius })
        }
      }
    }
    this.onExplosion?.(pos)
    this.physics.removeBody(g.body)
    this.scene.remove(g.mesh)
  }

  update(dt) {
    // ---- Proiettili balistici ----
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]
      b.ttl -= dt
      const p0 = b.pos.clone()
      b.vel.y -= b.gravity * dt
      const p1 = p0.clone().addScaledVector(b.vel, dt)

      // Collisione con la mappa e gli oggetti fisici
      this._ray.reset()
      this.physics.raycastClosest(
        new CANNON.Vec3(p0.x, p0.y, p0.z),
        new CANNON.Vec3(p1.x, p1.y, p1.z),
        { collisionFilterMask: GROUP.WORLD | GROUP.PROP, skipBackfaces: true },
        this._ray,
      )
      let wallT = this._ray.hasHit ? this._ray.hitPointWorld.distanceTo(new CANNON.Vec3(p0.x, p0.y, p0.z)) / Math.max(1e-6, p1.distanceTo(p0)) : Infinity

      // Collisione con i giocatori remoti (solo i proiettili locali fanno danno)
      let playerT = Infinity, playerHit = null
      if (b.local) {
        for (const t of this.getTargets(false)) {
          const tt = segmentVsBox(p0, p1, t.min, t.max)
          if (tt >= 0 && tt < playerT) { playerT = tt; playerHit = t }
        }
      }

      if (playerHit && playerT <= wallT) {
        this.onHitPlayer({ targetId: playerHit.id, weapon: b.weapon, shotId: b.shotId, scale: 1 })
        this._impactPuff(p0.clone().lerp(p1, playerT), 0xff6655)
        this._removeBullet(i)
        continue
      }
      if (this._ray.hasHit) {
        const hp = this._ray.hitPointWorld
        this._impactPuff(new THREE.Vector3(hp.x, hp.y, hp.z))
        // Gli oggetti colpiti reagiscono fisicamente
        const hitBody = this._ray.body
        if (hitBody && hitBody.type === CANNON.Body.DYNAMIC) {
          const def = WEAPONS[b.weapon]
          const imp = new CANNON.Vec3(b.vel.x, b.vel.y, b.vel.z)
          imp.normalize()
          imp.scale(def.push, imp)
          hitBody.wakeUp()
          hitBody.applyImpulse(imp, hp)
        }
        this._removeBullet(i)
        continue
      }

      b.pos.copy(p1)
      b.mesh.position.copy(p1)
      // Orienta graffette e penne lungo la traiettoria
      if (b.weapon === 'pen' || b.weapon === 'stapler') {
        b.mesh.lookAt(p1.clone().add(b.vel))
      }
      if (b.ttl <= 0) this._removeBullet(i)
    }

    // ---- Granate (rotolo di carta igienica) ----
    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i]
      g.fuse -= dt
      g.mesh.position.copy(g.body.position)
      g.mesh.quaternion.copy(g.body.quaternion)

      // Esplosione anticipata se tocca un giocatore
      let touched = false
      if (g.local) {
        for (const t of this.getTargets(false)) {
          if (t.center.distanceTo(g.mesh.position) < 0.8) { touched = true; break }
        }
      }
      if (g.fuse <= 0 || touched) {
        this._explode(g)
        this.grenades.splice(i, 1)
      }
    }

    // ---- Effetti temporanei ----
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i]
      e.ttl -= dt
      if (e.mesh) {
        if (e.grow) e.mesh.scale.addScalar(e.grow * dt)
        e.mesh.material.opacity = Math.max(0, e.ttl * 3)
      }
      if (e.light) e.light.intensity *= 0.8
      if (e.ttl <= 0) {
        if (e.mesh) this.scene.remove(e.mesh)
        if (e.light) this.scene.remove(e.light)
        this.effects.splice(i, 1)
      }
    }
  }

  _removeBullet(i) {
    this.scene.remove(this.bullets[i].mesh)
    this.bullets.splice(i, 1)
  }
}

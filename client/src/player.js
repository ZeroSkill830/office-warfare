// Controller FPS locale: corpo fisico cannon-es (due sfere impilate, rotazione
// bloccata) con movimento WASD, salto e collisioni solide contro la mappa.

import * as CANNON from 'cannon-es'
import { GROUP } from './world.js'

const SPEED = 9
const JUMP_VELOCITY = 8
const EYE_HEIGHT = 1.6

export class PlayerController {
  constructor(physics) {
    this.physics = physics
    // Contatti senza attrito: il movimento è interamente governato dal blending
    // della velocità in update(); l'attrito farebbe "arrampicare" sui muri.
    const playerMat = new CANNON.Material('player')
    physics.addContactMaterial(new CANNON.ContactMaterial(playerMat, physics.defaultMaterial, {
      friction: 0, restitution: 0,
    }))
    this.body = new CANNON.Body({
      mass: 70,
      fixedRotation: true,
      linearDamping: 0,
      material: playerMat,
      collisionFilterGroup: GROUP.PLAYER,
      collisionFilterMask: GROUP.WORLD | GROUP.PROP,
    })
    // Due sfere: piedi e busto/testa. body.position = piedi del giocatore.
    this.body.addShape(new CANNON.Sphere(0.45), new CANNON.Vec3(0, 0.45, 0))
    this.body.addShape(new CANNON.Sphere(0.45), new CANNON.Vec3(0, 1.35, 0))
    this.body.allowSleep = false
    physics.addBody(this.body)

    this._ray = new CANNON.RaycastResult()
    this.enabled = true
  }

  setPosition(x, y, z) {
    this.body.position.set(x, y, z)
    this.body.velocity.set(0, 0, 0)
  }

  get position() { return this.body.position }
  get eyeY() { return this.body.position.y + EYE_HEIGHT }

  isGrounded() {
    const p = this.body.position
    this._ray.reset()
    this.physics.raycastClosest(
      new CANNON.Vec3(p.x, p.y + 0.3, p.z),
      new CANNON.Vec3(p.x, p.y - 0.12, p.z),
      { collisionFilterMask: GROUP.WORLD | GROUP.PROP, skipBackfaces: true },
      this._ray,
    )
    return this._ray.hasHit
  }

  update(dt, keys, yaw) {
    const v = this.body.velocity
    if (!this.enabled) {
      v.x = 0; v.z = 0
      return
    }
    let fwd = 0, str = 0
    if (keys['KeyW']) fwd += 1
    if (keys['KeyS']) fwd -= 1
    if (keys['KeyD']) str += 1
    if (keys['KeyA']) str -= 1
    const len = Math.hypot(fwd, str) || 1
    fwd /= len; str /= len

    const sin = Math.sin(yaw), cos = Math.cos(yaw)
    // Con yaw=0 la camera guarda verso -z
    const vx = (-fwd * sin + str * cos) * SPEED
    const vz = (-fwd * cos - str * sin) * SPEED

    const blend = Math.min(1, dt * 25)
    v.x += (vx - v.x) * blend
    v.z += (vz - v.z) * blend

    if (keys['Space'] && this.isGrounded() && v.y < 1) {
      v.y = JUMP_VELOCITY
    }

    // Failsafe se si finisce fuori mappa
    if (this.body.position.y < -10) this.setPosition(0, 2, 0)
  }
}

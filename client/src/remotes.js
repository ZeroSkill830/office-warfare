// Avatar dei giocatori remoti: omino costruito con primitive, nickname e barra
// vita sopra la testa (sprite canvas), interpolazione dello stato ricevuto dal
// server e animazioni procedurali (camminata, salto, attacco).

import * as THREE from 'three'
import { makeWeaponMesh } from './weapons.js'
import { CHARACTERS, addAccessories, isCharacter } from './characters.js'

function colorFromId(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return new THREE.Color().setHSL((h % 360) / 360, 0.6, 0.5)
}

// Sprite con nickname + barra vita, ridisegnabile quando cambiano gli hp
function makeNameplate(name) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 80
  const ctx = canvas.getContext('2d')
  const tex = new THREE.CanvasTexture(canvas)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }))
  sprite.scale.set(1.5, 0.47, 1)

  function draw(hp) {
    ctx.clearRect(0, 0, 256, 80)
    ctx.font = 'bold 32px Arial'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    const w = Math.max(150, Math.min(250, ctx.measureText(name).width + 24))
    ctx.fillRect(128 - w / 2, 2, w, 44)
    ctx.fillStyle = '#fff'
    ctx.fillText(name, 128, 25)
    // Barra vita
    const bw = 140, bh = 11, bx = 128 - bw / 2, by = 56
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4)
    const frac = Math.max(0, Math.min(1, hp / 100))
    ctx.fillStyle = frac > 0.6 ? '#2ecc71' : frac > 0.3 ? '#f1c40f' : '#e74c3c'
    ctx.fillRect(bx, by, bw * frac, bh)
    tex.needsUpdate = true
  }
  draw(100)
  return { sprite, draw }
}

export class Remotes {
  constructor(scene, { onStep } = {}) {
    this.scene = scene
    this.onStep = onStep
    this.map = new Map()
  }

  add(info) {
    if (this.map.has(info.id)) return
    const char = isCharacter(info.char) ? CHARACTERS[info.char] : null
    const group = new THREE.Group()

    const bodyMat = new THREE.MeshLambertMaterial({ color: char ? char.shirt : colorFromId(info.id) })
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xd9b38c })
    const legMat = new THREE.MeshLambertMaterial({ color: char ? char.legs : 0x33373d })

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.3), bodyMat)
    torso.position.y = 1.05
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), skinMat)
    head.position.y = 1.6

    // Gambe e braccia con pivot in alto (anca/spalla) per l'animazione
    const limb = (w, h, d, mat) => {
      const geo = new THREE.BoxGeometry(w, h, d)
      geo.translate(0, -h / 2, 0)
      return new THREE.Mesh(geo, mat)
    }
    const legL = limb(0.2, 0.7, 0.26, legMat)
    legL.position.set(-0.13, 0.7, 0)
    const legR = limb(0.2, 0.7, 0.26, legMat)
    legR.position.set(0.13, 0.7, 0)
    const armL = limb(0.14, 0.6, 0.14, bodyMat)
    armL.position.set(-0.36, 1.35, 0)
    const armR = limb(0.14, 0.6, 0.14, bodyMat)
    armR.position.set(0.36, 1.35, 0)
    armR.rotation.x = -0.6 // tiene l'arma in avanti

    const weaponHolder = new THREE.Group()
    weaponHolder.position.set(0.36, 1.15, -0.35)
    let weaponMesh = makeWeaponMesh(info.weapon || 'mouse')
    weaponHolder.add(weaponMesh)

    const plate = makeNameplate(info.nick || '???')
    plate.sprite.position.y = 2.1
    plate.draw(info.hp ?? 100)

    group.add(torso, head, legL, legR, armL, armR, weaponHolder, plate.sprite)
    if (char) addAccessories(info.char, group)
    group.position.set(info.pos[0], info.pos[1], info.pos[2])
    this.scene.add(group)

    this.map.set(info.id, {
      id: info.id,
      nick: info.nick,
      group, weaponHolder, weaponMesh, plate,
      legL, legR, armL, armR,
      weapon: info.weapon || 'mouse',
      alive: info.alive !== false,
      hp: info.hp ?? 100,
      targetPos: new THREE.Vector3(...info.pos),
      targetYaw: info.rot?.[0] ?? 0,
      prevPos: new THREE.Vector3(...info.pos),
      phase: 0,        // fase del ciclo di camminata
      stepSign: 1,     // per rilevare l'appoggio del piede
      attackT: 0,      // timer rinculo del braccio dopo uno sparo
    })
  }

  remove(id) {
    const r = this.map.get(id)
    if (!r) return
    this.scene.remove(r.group)
    this.map.delete(id)
  }

  setState(id, p, r, w) {
    const a = this.map.get(id)
    if (!a) return
    a.targetPos.set(p[0], p[1], p[2])
    a.targetYaw = r[0]
    if (w && w !== a.weapon) {
      a.weapon = w
      a.weaponHolder.remove(a.weaponMesh)
      a.weaponMesh = makeWeaponMesh(w)
      a.weaponHolder.add(a.weaponMesh)
    }
  }

  setHP(id, hp) {
    const a = this.map.get(id)
    if (!a || hp === a.hp) return
    a.hp = hp
    a.plate.draw(hp)
  }

  setAlive(id, alive, pos) {
    const a = this.map.get(id)
    if (!a) return
    a.alive = alive
    a.group.visible = alive
    if (alive) this.setHP(id, 100)
    if (pos) {
      a.targetPos.set(pos[0], pos[1], pos[2])
      a.group.position.copy(a.targetPos)
    }
  }

  // Rinculo del braccio quando il giocatore remoto spara
  onShot(id) {
    const a = this.map.get(id)
    if (a) a.attackT = 0.18
  }

  update(dt) {
    const k = Math.min(1, dt * 12)
    for (const a of this.map.values()) {
      a.prevPos.copy(a.group.position)
      a.group.position.lerp(a.targetPos, k)
      let dy = a.targetYaw - a.group.rotation.y
      while (dy > Math.PI) dy -= Math.PI * 2
      while (dy < -Math.PI) dy += Math.PI * 2
      a.group.rotation.y += dy * k

      if (!a.alive) continue

      // Velocità stimata dal movimento interpolato
      const vx = (a.group.position.x - a.prevPos.x) / Math.max(dt, 1e-4)
      const vz = (a.group.position.z - a.prevPos.z) / Math.max(dt, 1e-4)
      const vy = (a.group.position.y - a.prevPos.y) / Math.max(dt, 1e-4)
      const speed = Math.hypot(vx, vz)
      const airborne = Math.abs(vy) > 1.2 || a.group.position.y > a.targetPos.y + 0.3

      if (airborne) {
        // Posa di salto/caduta: gambe divaricate avanti/dietro, braccia su
        a.legL.rotation.x += (0.55 - a.legL.rotation.x) * dt * 10
        a.legR.rotation.x += (-0.45 - a.legR.rotation.x) * dt * 10
        a.armL.rotation.x += (-1.1 - a.armL.rotation.x) * dt * 10
      } else {
        // Camminata: oscillazione proporzionale alla velocità
        const amp = Math.min(1, speed / 8) * 0.65
        a.phase += speed * dt * 2.2
        const s = Math.sin(a.phase)
        a.legL.rotation.x += (s * amp - a.legL.rotation.x) * dt * 14
        a.legR.rotation.x += (-s * amp - a.legR.rotation.x) * dt * 14
        a.armL.rotation.x += (-s * amp * 0.7 - a.armL.rotation.x) * dt * 14

        // Appoggio del piede (cambio di segno del seno) → passo udibile
        const sign = s >= 0 ? 1 : -1
        if (sign !== a.stepSign && amp > 0.2) {
          a.stepSign = sign
          this.onStep?.(a.group.position)
        }
      }

      // Braccio destro: posa di mira + rinculo allo sparo
      a.attackT = Math.max(0, a.attackT - dt)
      const aimX = a.attackT > 0 ? -1.4 : -0.6
      a.armR.rotation.x += (aimX - a.armR.rotation.x) * dt * 20
      a.weaponHolder.position.z = -0.35 + (a.attackT > 0 ? 0.08 : 0)
    }
  }

  // Bersagli per la rilevazione dei colpi (AABB di ogni avatar vivo)
  getTargets() {
    const out = []
    for (const a of this.map.values()) {
      if (!a.alive) continue
      const p = a.group.position
      out.push({
        id: a.id,
        min: new THREE.Vector3(p.x - 0.4, p.y, p.z - 0.4),
        max: new THREE.Vector3(p.x + 0.4, p.y + 1.8, p.z + 0.4),
        center: new THREE.Vector3(p.x, p.y + 0.9, p.z),
      })
    }
    return out
  }

  nickOf(id) {
    return this.map.get(id)?.nick
  }
}

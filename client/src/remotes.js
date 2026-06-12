// Avatar dei giocatori remoti: modello GLB del personaggio scelto (vedi
// models.js) con le clip Idle/Run/Jump/Shoot/Death, nickname e barra vita
// sopra la testa (sprite canvas) e interpolazione dello stato dal server.
// L'arma segue la mano destra (solo in posizione: l'orientamento resta
// quello dello sguardo, più robusto che agganciarla al bone).

import * as THREE from 'three'
import { makeWeaponMesh } from './weapons.js'
import { instantiate } from './models.js'
import { TEAM_COLORS } from './flags.js'

const FADE = 0.18

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

// Passa alla clip indicata con crossfade; once = riproduci una volta e ferma
function play(a, name, { once = false } = {}) {
  if (a.current === name) return
  const next = a.actions[name]
  if (!next) return
  const prev = a.actions[a.current]
  next.reset()
  next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity)
  next.clampWhenFinished = once
  next.fadeIn(FADE).play()
  prev?.fadeOut(FADE)
  a.current = name
}

export class Remotes {
  constructor(scene, { onStep } = {}) {
    this.scene = scene
    this.onStep = onStep
    this.map = new Map()
    this._tmp = new THREE.Vector3()
  }

  add(info) {
    if (this.map.has(info.id)) return
    const group = new THREE.Group()
    const avatar = instantiate(info.char)
    if (avatar) group.add(avatar.root)

    // Nelle modalità a squadre, anello colorato sotto i piedi
    if (info.team) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.42, 0.58, 28),
        new THREE.MeshBasicMaterial({ color: TEAM_COLORS[info.team], transparent: true, opacity: 0.75 }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.04
      group.add(ring)
    }

    const weaponHolder = new THREE.Group()
    weaponHolder.position.set(0.36, 1.15, -0.35)
    let weaponMesh = makeWeaponMesh(info.weapon || 'mouse')
    weaponHolder.add(weaponMesh)
    group.add(weaponHolder)

    const plate = makeNameplate(info.nick || '???')
    plate.sprite.position.y = 2.25
    plate.draw(info.hp ?? 100)
    group.add(plate.sprite)

    group.position.set(info.pos[0], info.pos[1], info.pos[2])
    this.scene.add(group)

    const a = {
      id: info.id,
      nick: info.nick,
      team: info.team || null,
      group, avatar, weaponHolder, weaponMesh, plate,
      mixer: avatar?.mixer, actions: avatar?.actions || {}, hand: avatar?.hand,
      current: null,   // clip "di base" attiva (Idle/Run/Jump/Death)
      shootT: 0,       // tempo residuo dell'overlay di sparo
      weapon: info.weapon || 'mouse',
      alive: info.alive !== false,
      hp: info.hp ?? 100,
      targetPos: new THREE.Vector3(...info.pos),
      targetYaw: info.rot?.[0] ?? 0,
      prevPos: new THREE.Vector3(...info.pos),
      phase: 0,        // accumulatore per i passi udibili
    }
    play(a, 'Idle')
    if (!a.alive) {
      play(a, 'Death', { once: true })
      plate.sprite.visible = false
    }
    this.map.set(info.id, a)
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
    a.plate.sprite.visible = alive
    a.weaponHolder.visible = alive
    if (alive) {
      this.setHP(id, 100)
      play(a, 'Idle')
      if (pos) {
        a.targetPos.set(pos[0], pos[1], pos[2])
        a.group.position.copy(a.targetPos)
        a.prevPos.copy(a.targetPos)
      }
    } else {
      // Il corpo resta visibile e cade (clip Death) fino al respawn
      a.shootT = 0
      a.actions.Shoot?.stop()
      play(a, 'Death', { once: true })
    }
  }

  // Sparo di un giocatore remoto: clip Shoot in overlay sul movimento
  onShot(id) {
    const a = this.map.get(id)
    if (!a || !a.alive) return
    a.shootT = 0.45
    const act = a.actions.Shoot
    if (act) {
      act.reset()
      act.setLoop(THREE.LoopOnce, 1)
      act.fadeIn(0.06).play()
    }
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

      a.mixer?.update(dt)
      if (!a.alive) continue

      // Overlay di sparo: dissolve quando il timer scade
      if (a.shootT > 0) {
        a.shootT -= dt
        if (a.shootT <= 0) a.actions.Shoot?.fadeOut(0.2)
      }

      // Velocità stimata dal movimento interpolato → scelta della clip
      const vx = (a.group.position.x - a.prevPos.x) / Math.max(dt, 1e-4)
      const vz = (a.group.position.z - a.prevPos.z) / Math.max(dt, 1e-4)
      const vy = (a.group.position.y - a.prevPos.y) / Math.max(dt, 1e-4)
      const speed = Math.hypot(vx, vz)
      const airborne = Math.abs(vy) > 1.2 || a.group.position.y > a.targetPos.y + 0.3

      if (airborne) {
        play(a, 'Jump', { once: true })
      } else if (speed > 1.2) {
        play(a, 'Run')
        if (a.actions.Run) a.actions.Run.timeScale = THREE.MathUtils.clamp(speed / 6, 0.7, 1.6)
        // Cadenza dei passi udibili proporzionale alla velocità
        a.phase += speed * dt * 2.2
        if (a.phase > Math.PI) {
          a.phase = 0
          this.onStep?.(a.group.position)
        }
      } else {
        play(a, 'Idle')
        a.phase = 0
      }

      // L'arma segue la mano destra (posizione del bone in coordinate gruppo)
      if (a.hand) {
        a.hand.getWorldPosition(this._tmp)
        a.group.worldToLocal(this._tmp)
        a.weaponHolder.position.copy(this._tmp)
      }
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

  teamOf(id) {
    return this.map.get(id)?.team ?? null
  }
}

// Office Warfare — entry point del client.
// Collega rendering (Three.js), fisica (cannon-es), armi, pickup, HUD e rete.

import * as THREE from 'three'
import { createWorld } from './world.js'
import { PlayerController } from './player.js'
import { WEAPONS, WeaponSystem } from './weapons.js'
import { Projectiles } from './projectiles.js'
import { Remotes } from './remotes.js'
import { Pickups, labelOf } from './pickups.js'
import { Minimap } from './minimap.js'
import { hud } from './hud.js'
import { connect, serverUrl } from './net.js'
import { audio } from './audio.js'
import {
  fetchCharacterList, loadCharacters, characters, isCharacter, defaultCharacter,
  labelOf as charLabel, charData, CharacterPreview,
} from './models.js'

// ---------- Rendering di base ----------
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 100)
scene.add(camera)

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// ---------- Mondo e sistemi ----------
const world = createWorld(scene)
const player = new PlayerController(world.physics)
const remotes = new Remotes(scene, { onStep: (pos) => audio.footstep(pos) })
const pickups = new Pickups(scene, world.physics)
const minimap = new Minimap(document.getElementById('minimap'), world.physics)

// ---------- Stato di gioco ----------
let net = null
let myId = null
let hp = 100
let dead = false
let deathUntil = 0
let yaw = 0, pitch = 0
let locked = false
const keys = {}
let lastStateSent = 0

function myTarget() {
  const p = player.position
  return {
    id: myId,
    min: new THREE.Vector3(p.x - 0.4, p.y, p.z - 0.4),
    max: new THREE.Vector3(p.x + 0.4, p.y + 1.8, p.z + 0.4),
    center: new THREE.Vector3(p.x, p.y + 0.9, p.z),
  }
}

const projectiles = new Projectiles({
  scene,
  physics: world.physics,
  bounceMat: world.bounceMat,
  // includeSelf=true per il danno ad area delle esplosioni (autodanno incluso)
  getTargets: (includeSelf) => {
    const targets = remotes.getTargets()
    if (includeSelf && myId && !dead) targets.push(myTarget())
    return targets
  },
  onHitPlayer: ({ targetId, weapon, shotId, scale }) => {
    net?.hit({ targetId, weapon, shotId, scale })
    if (targetId !== myId) {
      hud.hitmarker()
      audio.hit()
    }
  },
  onExplosion: (pos) => audio.explosion(pos),
})

const weapons = new WeaponSystem(camera, {
  onFire: (shot) => {
    projectiles.spawn({ ...shot, local: true })
    net?.shoot(shot)
    audio.shoot(shot.weapon)
  },
  onReloadStart: () => audio.reload(),
  onChanged: (ws) => {
    hud.setWeapon(WEAPONS, ws.slots, ws.current)
    hud.setAmmo(ws.slot.ammo, ws.slot.reserve, ws.reloading > 0)
  },
})

// ---------- Input ----------
document.addEventListener('keydown', (e) => {
  keys[e.code] = true
  if (e.code === 'Tab') {
    e.preventDefault()
    hud.toggleScoreboard(true)
  }
  if (!locked || dead) return
  if (e.code === 'KeyR') weapons.reload()
  if (e.code === 'Digit1') weapons.switchTo(1)
  if (e.code === 'Digit2') weapons.switchTo(2)
  if (e.code === 'KeyE') tryPickup()
})
document.addEventListener('keyup', (e) => {
  keys[e.code] = false
  if (e.code === 'Tab') hud.toggleScoreboard(false)
})
document.addEventListener('mousedown', (e) => {
  if (e.button === 0 && locked) weapons.triggerDown = true
})
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) weapons.triggerDown = false
})
document.addEventListener('mousemove', (e) => {
  if (!locked) return
  yaw -= e.movementX * 0.0022
  pitch -= e.movementY * 0.0022
  pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch))
})

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === renderer.domElement
  if (!locked) weapons.triggerDown = false
  if (net) hud.lockHint(!locked)
})
renderer.domElement.addEventListener('click', () => {
  if (net && !locked) renderer.domElement.requestPointerLock()
})

function tryPickup() {
  const near = pickups.nearest(player.position)
  if (!near) return
  if (near.kind === 'pickup') net.pickup(near.id)
  else net.pickupDrop(near.id)
}

// ---------- Rete ----------
function startGame(nick, char) {
  net = connect(nick, char, {
    onError: () => {
      document.getElementById('menu').classList.remove('hidden')
      document.getElementById('menu-error').textContent =
        'Impossibile connettersi al server (porta 3001). È avviato?'
    },

    onInit: (data) => {
      myId = data.id
      const me = data.players.find(p => p.id === myId)
      player.setPosition(me.pos[0], me.pos[1], me.pos[2])
      hp = me.hp
      for (const p of data.players) if (p.id !== myId) remotes.add(p)
      pickups.init(data.pickups)
      for (const d of data.drops) pickups.addDrop(d)
      hud.setScores(data.scores, myId)
      hud.setHP(hp)
      hud.show()
      document.getElementById('menu').classList.add('hidden')
      renderer.domElement.requestPointerLock()
      audio.startAmbient()
    },

    onPlayerJoined: (p) => {
      remotes.add(p)
      hud.message(`${p.nick} è entrato in partita`)
    },
    onPlayerLeft: ({ id }) => remotes.remove(id),

    onStates: (states) => {
      for (const [id, s] of Object.entries(states)) {
        if (id !== myId) remotes.setState(id, s.p, s.r, s.w)
      }
    },

    onShot: ({ shooterId, weapon, origin, dirs }) => {
      projectiles.spawn({ weapon, origin, dirs, local: false })
      remotes.onShot(shooterId)
      audio.shoot(weapon, origin)
    },

    onDamaged: ({ id, hp: newHp }) => {
      if (id === myId) {
        hp = newHp
        hud.setHP(hp)
        audio.hurt()
      } else {
        remotes.setHP(id, newHp)
      }
    },

    onDeath: ({ id, killerId, weapon }) => {
      const killerNick = killerId === myId ? 'te' : (remotes.nickOf(killerId) || '???')
      const victimNick = id === myId ? 'te' : (remotes.nickOf(id) || '???')
      hud.killfeed(
        killerId === myId ? 'Tu' : (remotes.nickOf(killerId) || '???'),
        id === myId ? 'Tu' : victimNick,
        WEAPONS[weapon]?.label || weapon,
      )
      if (id === myId) {
        dead = true
        deathUntil = performance.now() + 3000
        player.enabled = false
        hp = 0
        hud.setHP(0)
        hud.death(killerId === myId ? '' : killerNick)
        hud.deathTimer(3)
      } else {
        remotes.setAlive(id, false)
        if (killerId === myId) hud.message('Eliminazione!', 1500)
      }
    },

    onRespawned: ({ id, pos, hp: newHp }) => {
      if (id === myId) {
        dead = false
        player.enabled = true
        player.setPosition(pos[0], pos[1], pos[2])
        hp = newHp
        weapons.reset()
        hud.setHP(hp)
        hud.death(null)
      } else {
        remotes.setAlive(id, true, pos)
      }
    },

    onPickupTaken: ({ id, by, type, weapon, hp: newHp }) => {
      pickups.setActive(id, false)
      if (by !== myId) return
      audio.pickup()
      if (type === 'weapon') {
        const old = weapons.giveSpecial(weapon)
        if (old) net.dropWeapon(old)
        hud.message(`Hai raccolto: ${WEAPONS[weapon].label}`)
      } else if (type === 'ammo') {
        weapons.addAmmo()
        hud.message('Munizioni rifornite')
      } else if (type === 'medkit') {
        hp = newHp
        hud.setHP(hp)
        hud.message('Vita ripristinata')
      }
    },
    onPickupRespawned: ({ id }) => pickups.setActive(id, true),

    onDropSpawned: (drop) => pickups.addDrop(drop),
    onDropTaken: ({ id, by, weapon }) => {
      pickups.removeDrop(id)
      if (by === myId) {
        audio.pickup()
        const old = weapons.giveSpecial(weapon)
        if (old) net.dropWeapon(old)
        hud.message(`Hai raccolto: ${WEAPONS[weapon].label}`)
      }
    },

    onScores: (list) => hud.setScores(list, myId),
  })
}

// ---------- Menu ----------
const nickInput = document.getElementById('nick')
nickInput.value = localStorage.getItem('ow-nick') || ''

// Selettore del personaggio: la lista arriva dal server e i modelli GLB
// vengono caricati prima di mostrare il menu (schermata di loading con il
// bottone "Entra in ufficio"). Il menu ha due pagine: personaggio → modalità.
const menuEl = document.getElementById('menu')
const screenChar = document.getElementById('screen-char')
const screenMode = document.getElementById('screen-mode')
let selectedChar = null
let preview = null

function selectChar(id) {
  selectedChar = id
  localStorage.setItem('ow-char', id)
  const data = charData(id)
  document.getElementById('char-name').textContent = data.label
  document.getElementById('char-desc').textContent = data.description
  const statsEl = document.getElementById('char-stats')
  statsEl.innerHTML = Object.entries(data.stats).map(([name, val]) =>
    `<div class="stat-row">
      <span class="stat-label">${name}</span>
      <div class="stat-bar"><div class="stat-fill" style="width:${val * 20}%"></div></div>
      <span class="stat-val">${val}</span>
    </div>`
  ).join('')
  preview?.show(id)
}
function cycleChar(dir) {
  const list = characters()
  const i = (list.indexOf(selectedChar) + dir + list.length) % list.length
  selectChar(list[i])
}
document.getElementById('char-prev').addEventListener('click', () => cycleChar(-1))
document.getElementById('char-next').addEventListener('click', () => cycleChar(1))

async function boot() {
  const loadingEl = document.getElementById('loading')
  const loadFill = document.getElementById('load-fill')
  const loadText = document.getElementById('load-text')
  const ids = await fetchCharacterList()
  await loadCharacters(ids, (frac, text) => {
    loadFill.style.width = `${Math.round(frac * 100)}%`
    loadText.textContent = text
  })
  if (characters().length === 0) {
    loadText.textContent = 'Nessun modello caricato: il server è avviato?'
    return
  }
  preview = new CharacterPreview(document.getElementById('char-preview'))
  const saved = localStorage.getItem('ow-char')
  selectChar(isCharacter(saved) ? saved : defaultCharacter())
  // Asset pronti: si resta sul banner finché non si entra in ufficio
  document.getElementById('load-bar').classList.add('hidden')
  loadText.classList.add('hidden')
  document.getElementById('enter-office').classList.remove('hidden')
  document.getElementById('enter-office').addEventListener('click', () => {
    loadingEl.classList.add('fade-out')
    setTimeout(() => loadingEl.remove(), 700)
  })
}
boot()

// Navigazione tra le due pagine del menu (personaggio → briefing)
function goToBriefing() {
  const nick = nickInput.value.trim()
  if (!nick) {
    document.getElementById('char-error').textContent = 'Inserisci un nickname'
    return
  }
  document.getElementById('char-error').textContent = ''
  localStorage.setItem('ow-nick', nick)
  screenChar.classList.add('hidden')
  screenMode.classList.remove('hidden')
}
document.getElementById('to-modes').addEventListener('click', goToBriefing)
document.getElementById('back-to-char').addEventListener('click', () => {
  screenMode.classList.add('hidden')
  screenChar.classList.remove('hidden')
})
fetch(`${serverUrl()}/info`)
  .then(r => r.json())
  .then(({ players }) => {
    document.getElementById('online-count').textContent =
      players === 1 ? '1 collega in ufficio' : `${players} colleghi in ufficio`
  })
  .catch(() => {})

// Leaderboard persistente (migliori di sempre)
fetch(`${serverUrl()}/leaderboard`)
  .then(r => r.json())
  .then(list => {
    if (!list.length) return
    document.getElementById('menu-lb-rows').innerHTML = list.slice(0, 5).map(e =>
      `<li>${escapeText(e.nick)} — <span class="lb-kills">${e.kills}</span> uccisioni</li>`
    ).join('')
    document.getElementById('menu-leaderboard').classList.remove('hidden')
  })
  .catch(() => {})
function escapeText(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

document.getElementById('play').addEventListener('click', () => {
  if (!selectedChar) return // modelli non ancora caricati
  const nick = nickInput.value.trim()
  if (!nick) return
  document.getElementById('menu-error').textContent = ''
  startGame(nick, selectedChar)
})
nickInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') goToBriefing() })

// ---------- Loop di gioco ----------
let lastT = performance.now()
let stepPhase = 0
function loop(now) {
  requestAnimationFrame(loop)
  const dt = Math.min(0.05, (now - lastT) / 1000)
  lastT = now

  // Anteprima del personaggio finché il menu è visibile
  if (!menuEl.classList.contains('hidden')) preview?.update(dt)

  if (net) {
    player.update(dt, locked && !dead ? keys : {}, yaw)
    world.physics.step(1 / 60, dt, 3)
    world.sync()

    camera.position.set(player.position.x, player.eyeY, player.position.z)
    camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'))

    weapons.update(dt, locked && !dead)
    projectiles.update(dt)
    remotes.update(dt)
    pickups.update(dt)
    minimap.update(player.position, yaw, remotes)
    audio.updateListener(player.position.x, player.eyeY, player.position.z, yaw)

    // Passi del giocatore locale
    if (!dead) {
      const v = player.body.velocity
      const speed = Math.hypot(v.x, v.z)
      if (speed > 2 && player.isGrounded()) {
        stepPhase += speed * dt
        if (stepPhase > 3.4) {
          stepPhase = 0
          audio.footstep(null, 0.035)
        }
      } else {
        stepPhase = 0
      }
    }

    // Prompt di raccolta
    if (!dead) {
      const near = pickups.nearest(player.position)
      hud.prompt(near ? labelOf(near.data) : null)
    } else {
      hud.prompt(null)
      hud.deathTimer(Math.max(0, (deathUntil - now) / 1000))
    }

    // Invio dello stato al server a ~15 Hz
    if (now - lastStateSent > 66) {
      lastStateSent = now
      const p = player.position
      net.sendState([p.x, p.y, p.z], [yaw, pitch], weapons.slot.type)
    }
  }

  renderer.render(scene, camera)
}
requestAnimationFrame(loop)

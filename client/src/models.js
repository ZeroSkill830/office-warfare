// Modelli custom dei giocatori: i GLB in /assets/players/<id>/player.glb
// (uno per personaggio, con le clip Idle/Shoot/Jump/Death/Run). La lista degli
// id arriva dal server (GET /characters), che scansiona le stesse cartelle.

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js'
import { serverUrl } from './net.js'

export const CLIP_NAMES = ['Idle', 'Shoot', 'Jump', 'Death', 'Run']

const loaded = new Map() // id -> { scene, animations }
let characterIds = []

export function characters() {
  return characterIds
}

export function isCharacter(id) {
  return loaded.has(id)
}

export function defaultCharacter() {
  return characterIds[0]
}

export function labelOf(id) {
  return id.charAt(0).toUpperCase() + id.slice(1)
}

// Chiede al server quali personaggi esistono; se il server non risponde
// (es. Vite avviato senza server) si prova comunque con i nomi noti.
export async function fetchCharacterList() {
  try {
    const r = await fetch(`${serverUrl()}/characters`)
    const list = await r.json()
    if (Array.isArray(list) && list.length) return list
  } catch { /* server giù: fallback sotto */ }
  return ['davide', 'pier']
}

// Carica tutti i GLB. onProgress(frazione 0..1, testo) per la schermata di loading.
export async function loadCharacters(ids, onProgress) {
  const loader = new GLTFLoader()
  const fractions = ids.map(() => 0)
  const report = (text) => onProgress?.(
    fractions.reduce((a, b) => a + b, 0) / Math.max(1, ids.length), text)

  let done = 0
  await Promise.all(ids.map((id, i) =>
    new Promise((resolve) => {
      loader.load(
        `/assets/players/${id}/player.glb`,
        (gltf) => {
          loaded.set(id, { scene: gltf.scene, animations: gltf.animations })
          fractions[i] = 1
          done++
          report(`Personaggi: ${done}/${ids.length}`)
          resolve()
        },
        (ev) => {
          if (ev.total) {
            fractions[i] = Math.min(1, ev.loaded / ev.total)
            report(`Personaggi: ${done}/${ids.length}`)
          }
        },
        (err) => {
          console.error(`Modello "${id}" non caricato:`, err)
          fractions[i] = 1
          resolve() // il personaggio semplicemente non sarà disponibile
        },
      )
    })
  ))
  characterIds = ids.filter(id => loaded.has(id))
}

// Crea un'istanza animabile del personaggio: clone con scheletro proprio,
// mixer e una action per clip. Il modello guarda verso +z, la convenzione
// del gioco è -z (yaw 0), quindi il clone è ruotato di 180°.
export function instantiate(id) {
  const src = loaded.get(id) || loaded.get(defaultCharacter())
  if (!src) return null
  const root = SkeletonUtils.clone(src.scene)
  root.rotation.y = Math.PI
  const mixer = new THREE.AnimationMixer(root)
  const actions = {}
  for (const name of CLIP_NAMES) {
    const clip = THREE.AnimationClip.findByName(src.animations, name)
    if (clip) actions[name] = mixer.clipAction(clip)
  }
  let hand = null
  root.traverse((o) => { if (o.isBone && /RightHand$/.test(o.name)) hand = o })
  return { root, mixer, actions, hand }
}

// ---------- Anteprima nel menu: personaggio in Idle su turntable ----------
export class CharacterPreview {
  constructor(canvas) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.scene = new THREE.Scene()
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x55504a, 1.6))
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(1.5, 2.5, 2)
    this.scene.add(key)
    // Inquadratura ravvicinata: dal bacino in su (modello alto ~1.85 m).
    // Il canvas copre tutto lo schermo: la camera è traslata a destra così
    // il modello (a x=0) appare centrato nella metà sinistra.
    this.dist = 1.9
    this.eyeY = 1.38
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20)
    this.current = null
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  resize() {
    const w = this.canvas.clientWidth || 1
    const h = this.canvas.clientHeight || 1
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    // Semi-larghezza del frustum alla distanza del modello → offset di un
    // quarto di schermo per portare il modello al centro della metà sinistra
    const halfW = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.dist * this.camera.aspect
    this.camera.position.set(halfW / 2, this.eyeY, this.dist)
    this.camera.lookAt(halfW / 2, this.eyeY, 0)
    this.camera.updateProjectionMatrix()
  }

  show(id) {
    if (this.current) this.scene.remove(this.current.root)
    this.current = instantiate(id)
    if (!this.current) return
    this.current.root.rotation.y = 0 // orientamento nativo = +z, verso la camera
    this.scene.add(this.current.root)
    this.current.actions.Idle?.play()
  }

  update(dt) {
    if (!this.current) return
    this.current.mixer.update(dt)
    this.current.root.rotation.y += dt * 0.5
    this.renderer.render(this.scene, this.camera)
  }
}

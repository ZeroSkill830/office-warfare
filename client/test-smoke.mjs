// Smoke test runtime (Node): costruzione mappa, fisica del giocatore e
// proiettili, senza DOM. Esce con 0 se nessuna API genera errori.
import * as THREE from 'three'
import { createWorld } from './src/world.js'
import { PlayerController } from './src/player.js'
import { Projectiles } from './src/projectiles.js'

const ok = (name) => console.log('✓ ' + name)

const scene = new THREE.Scene()
const world = createWorld(scene)
ok(`Mappa costruita: ${world.physics.bodies.length} corpi fisici, ${scene.children.length} mesh`)
if (world.physics.bodies.length < 100) throw new Error('troppi pochi corpi fisici')

const player = new PlayerController(world.physics)
player.setPosition(7, 1, -15)

// Simula 2 secondi: il giocatore deve cadere e fermarsi sul pavimento
for (let i = 0; i < 120; i++) {
  player.update(1 / 60, { KeyW: true }, 0)
  world.physics.step(1 / 60)
  world.sync()
}
if (player.position.y < -0.5 || player.position.y > 1) throw new Error('giocatore non a terra: y=' + player.position.y)
if (!player.isGrounded()) throw new Error('isGrounded falso a terra')
ok(`Giocatore a terra (y=${player.position.y.toFixed(3)}), grounded, avanzato a z=${player.position.z.toFixed(2)}`)

// Il giocatore non deve attraversare i muri: cammina contro la parete di fondo
player.setPosition(9, 0, -15)
for (let i = 0; i < 240; i++) {
  player.update(1 / 60, { KeyD: true }, 0) // verso +x, parete esterna a x=11
  world.physics.step(1 / 60)
}
if (player.position.x > 10.8) throw new Error('compenetrazione muro: x=' + player.position.x)
ok(`Collisione solida con i muri (fermo a x=${player.position.x.toFixed(2)})`)

// Proiettili: uno colpisce il muro, la granata esplode dopo la miccia
let hits = []
let exploded = false
const proj = new Projectiles({
  scene,
  physics: world.physics,
  bounceMat: world.bounceMat,
  getTargets: () => [{
    id: 'dummy',
    min: new THREE.Vector3(-0.4, 0, -5.4),
    max: new THREE.Vector3(0.4, 1.8, -4.6),
    center: new THREE.Vector3(0, 0.9, -5),
  }],
  onHitPlayer: (h) => hits.push(h),
  onExplosion: () => { exploded = true },
})
proj.spawn({ weapon: 'stapler', origin: [0, 1.6, 0], dirs: [[0, 0, -1]], shotId: 's1', local: true })
proj.spawn({ weapon: 'mouse', origin: [0, 1.6, 20], dirs: [[0, 0, 1]], shotId: 's2', local: true })
proj.spawn({ weapon: 'tproll', origin: [0, 2, -8], dirs: [[0, -0.4, 0.4]], shotId: 's3', local: true })
for (let i = 0; i < 180; i++) {
  world.physics.step(1 / 60)
  proj.update(1 / 60)
}
if (!hits.some(h => h.targetId === 'dummy' && h.weapon === 'stapler')) throw new Error('graffetta non ha colpito il bersaglio')
ok('Graffetta colpisce il bersaglio (segmento vs AABB)')
if (!exploded) throw new Error('granata non esplosa')
if (!hits.some(h => h.weapon === 'tproll')) throw new Error('esplosione senza danno ad area')
ok('Rotolo di carta esplode con danno ad area')
if (proj.bullets.length !== 0) throw new Error('proiettili non ripuliti')
ok('Proiettili rimossi a fine corsa (muro / ttl)')

console.log('\nSMOKE TEST PASSATO')

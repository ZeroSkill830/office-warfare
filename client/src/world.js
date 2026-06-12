// Costruzione della mappa (ufficio) con geometria Three.js e corpi statici cannon-es.
// Layout: corridoio centrale x in [-3,3], z in [-22,22]; 4 stanze per lato (8x10),
// centri z: -15, -5, 5, 15. Porte blu sulle pareti del corridoio.

import * as THREE from 'three'
import * as CANNON from 'cannon-es'

export const GROUP = { WORLD: 1, PLAYER: 2, PROP: 4, DEBRIS: 8 }

const WALL_H = 3.2
const T = 0.2
const ROOM_CENTERS_Z = [-15, -5, 5, 15]

export function createWorld(scene) {
  const physics = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) })
  physics.broadphase = new CANNON.SAPBroadphase(physics)
  physics.allowSleep = true
  physics.defaultContactMaterial.friction = 0.4
  physics.defaultContactMaterial.restitution = 0.05

  // Materiale fisico "rimbalzante" per il rotolo di carta igienica
  const bounceMat = new CANNON.Material('bounce')
  physics.addContactMaterial(new CANNON.ContactMaterial(physics.defaultMaterial, bounceMat, {
    friction: 0.3, restitution: 0.55,
  }))

  const props = [] // corpi dinamici { mesh, body } da sincronizzare ogni frame

  // ---------- Materiali grafici ----------
  const M = {
    floor: new THREE.MeshLambertMaterial({ color: 0x5c6066 }),
    carpet: new THREE.MeshLambertMaterial({ color: 0x39506b }),
    ceiling: new THREE.MeshLambertMaterial({ color: 0xd8d8d2 }),
    wall: new THREE.MeshLambertMaterial({ color: 0xd6d3cb }),
    wallIn: new THREE.MeshLambertMaterial({ color: 0xc4ccd4 }),
    door: new THREE.MeshLambertMaterial({ color: 0x2563eb }),
    doorFrame: new THREE.MeshLambertMaterial({ color: 0x1e4fbd }),
    deskTop: new THREE.MeshLambertMaterial({ color: 0x9a7b53 }),
    deskSide: new THREE.MeshLambertMaterial({ color: 0x7a6142 }),
    dark: new THREE.MeshLambertMaterial({ color: 0x222428 }),
    screen: new THREE.MeshLambertMaterial({ color: 0x0b1e3a, emissive: 0x2e6bff, emissiveIntensity: 0.55 }),
    chair: new THREE.MeshLambertMaterial({ color: 0x33373d }),
    chairSeat: new THREE.MeshLambertMaterial({ color: 0x44525e }),
    neon: new THREE.MeshBasicMaterial({ color: 0xf5f9ff }),
    printer: new THREE.MeshLambertMaterial({ color: 0xb8bcc0 }),
    cabinet: new THREE.MeshLambertMaterial({ color: 0x8a8f96 }),
    pot: new THREE.MeshLambertMaterial({ color: 0xa0522d }),
    plant: new THREE.MeshLambertMaterial({ color: 0x2f8f46 }),
  }

  // ---------- Helper: box statico (mesh + corpo fisico) ----------
  function staticBox(w, h, d, x, y, z, mat, { physical = true, ry = 0 } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    mesh.position.set(x, y, z)
    mesh.rotation.y = ry
    scene.add(mesh)
    if (physical) {
      const body = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2)),
        position: new CANNON.Vec3(x, y, z),
        collisionFilterGroup: GROUP.WORLD,
      })
      body.quaternion.setFromEuler(0, ry, 0)
      physics.addBody(body)
    }
    return mesh
  }

  // ---------- Pavimento e soffitto ----------
  staticBox(22.4, 0.2, 44.6, 0, -0.1, 0, M.floor)
  // Tappeto del corridoio (solo visivo)
  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 44), M.carpet)
  carpet.rotation.x = -Math.PI / 2
  carpet.position.y = 0.005
  scene.add(carpet)
  staticBox(22.4, 0.2, 44.6, 0, WALL_H + 0.1, 0, M.ceiling)

  // ---------- Perimetro esterno ----------
  staticBox(T, WALL_H, 44.6, -11.1, WALL_H / 2, 0, M.wall)
  staticBox(T, WALL_H, 44.6, 11.1, WALL_H / 2, 0, M.wall)
  staticBox(22.4, WALL_H, T, 0, WALL_H / 2, -22.2, M.wall)
  staticBox(22.4, WALL_H, T, 0, WALL_H / 2, 22.2, M.wall)

  // ---------- Pareti del corridoio con porte ----------
  const DOOR_W = 1.6, DOOR_H = 2.2
  const gaps = ROOM_CENTERS_Z.map(z => [z - DOOR_W / 2, z + DOOR_W / 2])
  for (const sx of [-1, 1]) {
    const wx = sx * 3
    let z0 = -22.2
    for (const [g0, g1] of gaps) {
      const len = g0 - z0
      staticBox(T, WALL_H, len, wx, WALL_H / 2, z0 + len / 2, M.wallIn)
      // Architrave sopra la porta
      staticBox(T, WALL_H - DOOR_H, DOOR_W, wx, DOOR_H + (WALL_H - DOOR_H) / 2, (g0 + g1) / 2, M.wallIn)
      // Stipiti blu
      staticBox(T + 0.08, DOOR_H, 0.1, wx, DOOR_H / 2, g0 - 0.05, M.doorFrame)
      staticBox(T + 0.08, DOOR_H, 0.1, wx, DOOR_H / 2, g1 + 0.05, M.doorFrame)
      staticBox(T + 0.08, 0.12, DOOR_W + 0.2, wx, DOOR_H + 0.06, (g0 + g1) / 2, M.doorFrame)
      // Anta blu aperta verso la stanza, appoggiata alla parete interna
      staticBox(0.06, DOOR_H - 0.05, DOOR_W - 0.1, wx + sx * 0.85, (DOOR_H - 0.05) / 2, g1 + 0.78, M.door, { ry: Math.PI / 2 })
      z0 = g1
    }
    staticBox(T, WALL_H, 22.2 - z0, wx, WALL_H / 2, z0 + (22.2 - z0) / 2, M.wallIn)
  }

  // ---------- Pareti divisorie tra le stanze ----------
  for (const wz of [-20, -10, 0, 10, 20]) {
    staticBox(8, WALL_H, T, 7, WALL_H / 2, wz, M.wallIn)
    staticBox(8, WALL_H, T, -7, WALL_H / 2, wz, M.wallIn)
  }

  // ---------- Arredamento ----------
  // Ruota un offset (dx,dz) attorno al centro per scrivanie orientate
  function rot2(dx, dz, ry) {
    const c = Math.cos(ry), s = Math.sin(ry)
    return [dx * c + dz * s, -dx * s + dz * c]
  }

  // Scrivania con monitor sopra (corpi statici, usabile come copertura)
  function addDesk(cx, cz, ry) {
    const part = (w, h, d, dx, y, dz, mat) => {
      const [ox, oz] = rot2(dx, dz, ry)
      staticBox(w, h, d, cx + ox, y, cz + oz, mat, { ry })
    }
    part(2.2, 0.06, 1.0, 0, 0.75, 0, M.deskTop)          // piano
    part(0.06, 0.72, 1.0, -1.07, 0.36, 0, M.deskSide)    // fianco sx
    part(0.06, 0.72, 1.0, 1.07, 0.36, 0, M.deskSide)     // fianco dx
    // Monitor (visivo, niente fisica: è sopra il piano)
    const mon = (dx, dz) => {
      const [ox, oz] = rot2(dx, dz, ry)
      const g = new THREE.Group()
      g.position.set(cx + ox, 0.78, cz + oz)
      g.rotation.y = ry
      const stand = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.14), M.dark)
      stand.position.y = 0.06
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.34, 0.04), M.dark)
      screen.position.y = 0.3
      const display = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.29), M.screen)
      display.position.set(0, 0.3, 0.021)
      g.add(stand, screen, display)
      scene.add(g)
    }
    mon(-0.45, -0.18)
    mon(0.45, -0.18)
    // Tastiera decorativa sul piano
    const [kx, kz] = rot2(0, 0.25, ry)
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.15), M.dark)
    kb.position.set(cx + kx, 0.79, cz + kz)
    kb.rotation.y = ry
    scene.add(kb)
  }

  // Sedia da ufficio: corpo dinamico, può ribaltarsi ed essere spinta
  function addChair(cx, cz, ry = 0) {
    const g = new THREE.Group()
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), M.chairSeat)
    seat.position.y = 0.48
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.07), M.chairSeat)
    back.position.set(0, 0.82, -0.24)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 8), M.chair)
    pole.position.y = 0.24
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.06, 10), M.chair)
    base.position.y = 0.04
    g.add(seat, back, pole, base)
    g.position.set(cx, 0, cz)
    g.rotation.y = ry
    scene.add(g)

    const body = new CANNON.Body({
      mass: 7,
      shape: new CANNON.Box(new CANNON.Vec3(0.26, 0.55, 0.26)),
      position: new CANNON.Vec3(cx, 0.55, cz),
      collisionFilterGroup: GROUP.PROP,
      collisionFilterMask: GROUP.WORLD | GROUP.PLAYER | GROUP.PROP | GROUP.DEBRIS,
      linearDamping: 0.25,
      angularDamping: 0.35,
    })
    body.quaternion.setFromEuler(0, ry, 0)
    body.allowSleep = true
    body.sleepSpeedLimit = 0.3
    physics.addBody(body)
    // La mesh è ancorata ai piedi: sincronizziamo con offset -0.55 dal centro del corpo
    props.push({ mesh: g, body, offsetY: -0.55 })
  }

  // Pianta da ufficio
  function addPlant(cx, cz) {
    const g = new THREE.Group()
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.32, 10), M.pot)
    pot.position.y = 0.16
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.5, 6), M.deskSide)
    trunk.position.y = 0.5
    const fol1 = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), M.plant)
    fol1.position.y = 0.95
    const fol2 = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), M.plant)
    fol2.position.set(0.15, 1.15, 0.1)
    g.add(pot, trunk, fol1, fol2)
    g.position.set(cx, 0, cz)
    scene.add(g)
    const body = new CANNON.Body({
      type: CANNON.Body.STATIC,
      shape: new CANNON.Cylinder(0.2, 0.2, 1.2, 8),
      position: new CANNON.Vec3(cx, 0.6, cz),
      collisionFilterGroup: GROUP.WORLD,
    })
    physics.addBody(body)
  }

  // Stampante su mobiletto
  function addPrinter(cx, cz) {
    staticBox(0.7, 0.6, 0.55, cx, 0.3, cz, M.cabinet)
    const printer = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.28, 0.42), M.printer)
    printer.position.set(cx, 0.74, cz)
    scene.add(printer)
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, 0.18), M.dark)
    tray.position.set(cx, 0.9, cz)
    scene.add(tray)
  }

  // Luce al neon: pannello emissivo a soffitto
  function addNeon(cx, cz, ry = 0) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.5), M.neon)
    panel.position.set(cx, WALL_H - 0.04, cz)
    panel.rotation.y = ry
    scene.add(panel)
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.05, 0.62), M.dark)
    frame.position.set(cx, WALL_H - 0.01, cz)
    frame.rotation.y = ry
    scene.add(frame)
  }

  // ---------- Composizione delle 8 stanze ----------
  for (const sx of [-1, 1]) {
    for (const zc of ROOM_CENTERS_Z) {
      const xc = sx * 7
      addDesk(xc - sx * 0.8, zc - 2.3, 0)                    // desk1 (pickup a ±6.2, zc-2.3)
      addDesk(xc + sx * 2.6, zc + 2.3, Math.PI / 2)          // desk2 contro la parete di fondo
      addChair(xc - sx * 0.8, zc - 1.3, Math.PI)
      addChair(xc + sx * 1.5, zc + 2.3, sx > 0 ? -Math.PI / 2 : Math.PI / 2)
      addPlant(xc + sx * 3.3, zc - 3.2)
      addPrinter(sx * 3.6, zc + 3.2)
      addNeon(xc, zc)
    }
  }
  // Neon lungo il corridoio
  for (const z of [-18, -10, -2, 6, 14, 20]) addNeon(0, z, Math.PI / 2)

  // ---------- Luci ----------
  scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x4a4a42, 1.15))
  const ambient = new THREE.AmbientLight(0xffffff, 0.25)
  scene.add(ambient)
  for (const z of [-15, -5, 5, 15]) {
    const light = new THREE.PointLight(0xeef4ff, 14, 18, 1.8)
    light.position.set(0, 2.9, z)
    scene.add(light)
  }

  scene.background = new THREE.Color(0x10141c)
  scene.fog = new THREE.Fog(0x10141c, 30, 60)

  // ---------- Sincronizzazione dei corpi dinamici ----------
  function sync() {
    for (const p of props) {
      p.mesh.position.copy(p.body.position)
      if (p.offsetY) {
        // riposiziona la mesh rispetto al centro del corpo, tenendo conto della rotazione
        const off = new CANNON.Vec3(0, p.offsetY, 0)
        p.body.quaternion.vmult(off, off)
        p.mesh.position.x += off.x
        p.mesh.position.y += off.y
        p.mesh.position.z += off.z
      }
      p.mesh.quaternion.copy(p.body.quaternion)
    }
  }

  // In cannon-es le coppie di ContactMaterial valgono solo se entrambi i corpi
  // hanno un materiale: assegna il defaultMaterial a tutti i corpi della mappa
  // (serve al materiale senza attrito del giocatore e al rimbalzo delle granate).
  for (const b of physics.bodies) if (!b.material) b.material = physics.defaultMaterial

  return { physics, props, bounceMat, sync }
}

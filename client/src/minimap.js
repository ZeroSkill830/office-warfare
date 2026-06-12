// Mini-mappa 2D in overlay: la pianta è generata una volta sola proiettando i
// corpi fisici statici "alti" (i muri) su un canvas; ogni frame si disegnano
// sopra la freccia del giocatore e i punti degli avversari.

const SCALE = 5 // pixel per metro
const PAD = 5
const X_HALF = 11.2, Z_HALF = 22.3 // semiestensioni della mappa (da world.js)

export class Minimap {
  constructor(canvas, physics) {
    this.canvas = canvas
    this.canvas.width = X_HALF * 2 * SCALE + PAD * 2
    this.canvas.height = Z_HALF * 2 * SCALE + PAD * 2
    this.ctx = canvas.getContext('2d')
    this.base = this._buildBase(physics)
  }

  _toPx(wx, wz) {
    return [(wx + X_HALF) * SCALE + PAD, (wz + Z_HALF) * SCALE + PAD]
  }

  _buildBase(physics) {
    const off = document.createElement('canvas')
    off.width = this.canvas.width
    off.height = this.canvas.height
    const ctx = off.getContext('2d')

    ctx.fillStyle = 'rgba(10, 16, 26, 0.82)'
    ctx.fillRect(0, 0, off.width, off.height)

    // Muri: corpi statici a forma di box abbastanza alti da non essere arredi
    ctx.fillStyle = '#5e779c'
    for (const body of physics.bodies) {
      if (body.mass !== 0) continue
      const shape = body.shapes[0]
      const he = shape?.halfExtents
      if (!he || he.y < 0.9) continue
      // Yaw del corpo (le rotazioni in mappa sono solo attorno a Y)
      const q = body.quaternion
      const ry = 2 * Math.atan2(q.y, q.w)
      const [cx, cy] = this._toPx(body.position.x, body.position.z)
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(-ry)
      ctx.fillRect(-he.x * SCALE, -he.z * SCALE, he.x * 2 * SCALE, he.z * 2 * SCALE)
      ctx.restore()
    }
    return off
  }

  // pos = posizione del giocatore locale, yaw = direzione di vista,
  // remotes = istanza di Remotes (per i punti degli avversari)
  update(pos, yaw, remotes) {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.drawImage(this.base, 0, 0)

    // Avversari vivi: punti rossi
    ctx.fillStyle = '#ff5252'
    for (const a of remotes.map.values()) {
      if (!a.alive) continue
      const [x, y] = this._toPx(a.group.position.x, a.group.position.z)
      ctx.beginPath()
      ctx.arc(x, y, 3.2, 0, Math.PI * 2)
      ctx.fill()
    }

    // Giocatore locale: freccia orientata con lo sguardo (yaw 0 = -z = alto)
    const [px, py] = this._toPx(pos.x, pos.z)
    ctx.save()
    ctx.translate(px, py)
    ctx.rotate(-yaw)
    ctx.fillStyle = '#6fb3ff'
    ctx.beginPath()
    ctx.moveTo(0, -6)
    ctx.lineTo(4.5, 5)
    ctx.lineTo(0, 2.5)
    ctx.lineTo(-4.5, 5)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
}

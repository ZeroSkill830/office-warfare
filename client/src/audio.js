// Effetti sonori sintetizzati con WebAudio (nessun asset esterno).
// I suoni possono essere spazializzati: volume e pan stereo calcolati dalla
// posizione della sorgente rispetto all'ascoltatore (camera).

let ctx = null
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

// Posizione/orientamento dell'ascoltatore, aggiornati dal game loop
const listener = { x: 0, y: 0, z: 0, yaw: 0 }

// Volume e pan per una sorgente in `pos` ([x,y,z] o {x,y,z}); null = suono UI
function spatial(pos) {
  if (!pos) return { vol: 1, pan: 0 }
  const px = pos.x ?? pos[0], py = pos.y ?? pos[1], pz = pos.z ?? pos[2]
  const dx = px - listener.x, dy = py - listener.y, dz = pz - listener.z
  const d = Math.hypot(dx, dy, dz)
  const vol = 1 / (1 + d * d * 0.012) // ~0.45 a 10 m, ~0.15 a 22 m
  // Pan: componente laterale della direzione rispetto allo sguardo
  const sin = Math.sin(listener.yaw), cos = Math.cos(listener.yaw)
  const right = (dx * cos - dz * sin) / Math.max(d, 0.001)
  return { vol, pan: Math.max(-1, Math.min(1, right * 0.8)) }
}

function out(gainNode, pan) {
  const a = ac()
  if (pan && a.createStereoPanner) {
    const p = a.createStereoPanner()
    p.pan.value = pan
    gainNode.connect(p).connect(a.destination)
  } else {
    gainNode.connect(a.destination)
  }
}

function noiseBurst({ duration = 0.08, freq = 1500, q = 4, gain = 0.25, pos = null }) {
  const { vol, pan } = spatial(pos)
  if (vol < 0.02) return
  const a = ac()
  const len = Math.floor(a.sampleRate * duration)
  const buf = a.createBuffer(1, len, a.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len)
  const src = a.createBufferSource()
  src.buffer = buf
  const filter = a.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = freq
  filter.Q.value = q
  const g = a.createGain()
  g.gain.setValueAtTime(gain * vol, a.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + duration)
  src.connect(filter).connect(g)
  out(g, pan)
  src.start()
}

export const audio = {
  // Da chiamare ogni frame con posizione e yaw della camera
  updateListener(x, y, z, yaw) {
    listener.x = x; listener.y = y; listener.z = z; listener.yaw = yaw
  },

  shoot(weapon, pos = null) {
    const params = {
      mouse: { duration: 0.09, freq: 900, gain: 0.22 },
      keyboard: { duration: 0.16, freq: 500, gain: 0.32 },
      stapler: { duration: 0.05, freq: 2200, gain: 0.15 },
      tproll: { duration: 0.12, freq: 300, gain: 0.2 },
      pen: { duration: 0.06, freq: 3000, gain: 0.12 },
    }[weapon] || {}
    noiseBurst({ ...params, pos })
  },

  explosion(pos = null) {
    const { vol, pan } = spatial(pos)
    if (vol < 0.02) return
    noiseBurst({ duration: 0.5, freq: 120, q: 0.8, gain: 0.5, pos })
    const a = ac()
    const osc = a.createOscillator()
    osc.frequency.setValueAtTime(160, a.currentTime)
    osc.frequency.exponentialRampToValueAtTime(35, a.currentTime + 0.4)
    const g = a.createGain()
    g.gain.setValueAtTime(0.3 * vol, a.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.45)
    osc.connect(g)
    out(g, pan)
    osc.start()
    osc.stop(a.currentTime + 0.5)
  },

  footstep(pos = null, gain = 0.07) {
    noiseBurst({ duration: 0.05, freq: 240, q: 1.5, gain, pos })
  },

  hit() { noiseBurst({ duration: 0.04, freq: 2600, gain: 0.18 }) },
  hurt() { noiseBurst({ duration: 0.12, freq: 350, gain: 0.3 }) },

  pickup() {
    const a = ac()
    const osc = a.createOscillator()
    osc.frequency.setValueAtTime(520, a.currentTime)
    osc.frequency.setValueAtTime(780, a.currentTime + 0.07)
    const g = a.createGain()
    g.gain.setValueAtTime(0.15, a.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.2)
    osc.connect(g).connect(a.destination)
    osc.start()
    osc.stop(a.currentTime + 0.2)
  },

  reload() { noiseBurst({ duration: 0.1, freq: 1200, q: 8, gain: 0.1 }) },

  // Ambiente d'ufficio: ronzio dei neon + soffio di ventilazione, in loop
  startAmbient() {
    if (this._ambient) return
    const a = ac()
    const hum = a.createOscillator()
    hum.frequency.value = 100
    const humG = a.createGain()
    humG.gain.value = 0.012
    hum.connect(humG).connect(a.destination)
    hum.start()

    const len = a.sampleRate * 2
    const buf = a.createBuffer(1, len, a.sampleRate)
    const data = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      last = (last + (Math.random() * 2 - 1) * 0.02) * 0.998
      data[i] = last
    }
    const noise = a.createBufferSource()
    noise.buffer = buf
    noise.loop = true
    const lp = a.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 400
    const nG = a.createGain()
    nG.gain.value = 0.25
    noise.connect(lp).connect(nG).connect(a.destination)
    noise.start()
    this._ambient = true
  },
}

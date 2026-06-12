// HUD a DOM: vita, munizioni, arma, killfeed, classifica, prompt e overlay.

const $ = (id) => document.getElementById(id)

export const hud = {
  show() { $('hud').classList.remove('hidden') },

  setHP(hp) {
    const v = Math.max(0, Math.round(hp))
    $('hp-num').textContent = v
    const fill = $('hp-fill')
    fill.style.width = v + '%'
    fill.style.background = v > 60
      ? 'linear-gradient(90deg, #8db33b, #6d9128)'
      : v > 30
        ? 'linear-gradient(90deg, #e0b94f, #c98f2c)'
        : 'linear-gradient(90deg, #e74c3c, #c0392b)'
  },

  setWeapon(weapons, slots, current) {
    const slot = slots[current]
    const def = weapons[slot.type]
    $('weapon-name').textContent = `${def.label} — ${def.cls}`
    $('slots').innerHTML = [1, 2].map(n => {
      if (!slots[n]) {
        return `<div class="slot empty"><span class="key">${n}</span><span class="name">vuoto</span></div>`
      }
      const d = weapons[slots[n].type]
      return `<div class="slot${n === current ? ' active' : ''}">` +
        `<span class="key">${n}</span><span class="icon">${d.icon}</span><span class="name">${escapeHtml(d.label)}</span></div>`
    }).join('')
  },

  setAmmo(ammo, reserve, reloading) {
    const el = $('ammo')
    if (reloading) {
      el.textContent = 'RICARICA...'
      el.classList.add('reloading')
    } else {
      el.textContent = `${ammo} / ${reserve}`
      el.classList.remove('reloading')
    }
  },

  killfeed(killerNick, victimNick, weaponLabel) {
    const entry = document.createElement('div')
    entry.className = 'entry'
    entry.innerHTML = `<b>${escapeHtml(killerNick)}</b> [${escapeHtml(weaponLabel)}] <span class="victim">${escapeHtml(victimNick)}</span>`
    const feed = $('killfeed')
    feed.prepend(entry)
    while (feed.children.length > 6) feed.lastChild.remove()
    setTimeout(() => entry.remove(), 6000)
  },

  setScores(list, myId) {
    const sorted = [...list].sort((a, b) =>
      (a.team && b.team && a.team !== b.team) ? a.team.localeCompare(b.team) : b.kills - a.kills || a.deaths - b.deaths)
    $('score-rows').innerHTML = sorted.map(s =>
      `<tr class="${s.id === myId ? 'me' : ''}${s.team ? ' team-' + s.team : ''}"><td>${escapeHtml(s.nick)}</td><td>${s.kills}</td><td>${s.deaths}</td></tr>`
    ).join('')
    const byKills = [...list].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
    const me = byKills.find(s => s.id === myId)
    const rank = byKills.findIndex(s => s.id === myId) + 1
    if (me) $('score-mini').textContent = `#${rank} — ${me.kills} uccisioni / ${me.deaths} morti`
  },

  setMode(label) { $('match-mode').textContent = label },

  setClock(seconds) {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    $('match-clock').textContent = `${m}:${String(s).padStart(2, '0')}`
  },

  setTeamScores(scores, myTeam) {
    const el = $('team-scores')
    if (!scores || !myTeam) { el.classList.add('hidden'); return }
    el.classList.remove('hidden')
    el.innerHTML =
      `<b class="team-a">Blu ${scores.a}</b> — <b class="team-b">${scores.b} Rossi</b>` +
      (myTeam ? ` <span style="color:#8aa0b8">(sei ${myTeam === 'a' ? 'Blu' : 'Rosso'})</span>` : '')
  },

  matchEnd(text, color) {
    $('match-winner').textContent = text
    $('match-winner').style.color = color || '#fff'
    $('match-end').classList.remove('hidden')
  },

  matchEndHide() { $('match-end').classList.add('hidden') },

  toggleScoreboard(show) { $('scoreboard').classList.toggle('hidden', !show) },

  prompt(text) {
    const el = $('prompt')
    if (!text) { el.classList.add('hidden'); return }
    el.innerHTML = `Premi <b>E</b> per raccogliere ${escapeHtml(text)}`
    el.classList.remove('hidden')
  },

  message(text, ms = 2500) {
    const el = $('msg')
    el.textContent = text
    el.classList.remove('hidden')
    clearTimeout(this._msgT)
    this._msgT = setTimeout(() => el.classList.add('hidden'), ms)
  },

  hitmarker() {
    const el = $('hitmarker')
    el.style.opacity = 1
    clearTimeout(this._hmT)
    this._hmT = setTimeout(() => { el.style.opacity = 0 }, 90)
  },

  death(killerNick) {
    const ov = $('death-overlay')
    if (killerNick === null) { ov.classList.add('hidden'); return }
    ov.classList.remove('hidden')
    $('death-text').textContent = killerNick ? `Eliminato da ${killerNick}` : 'Sei stato eliminato'
  },

  deathTimer(secondsLeft) {
    $('death-timer').textContent = `Respawn tra ${secondsLeft.toFixed(1)}s...`
  },

  lockHint(show) { $('lock-hint').classList.toggle('hidden', !show) },
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

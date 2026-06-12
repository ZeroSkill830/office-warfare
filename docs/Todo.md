# Todo — Office Warfare

Roadmap delle feature, divisa in fasi (vedi `How_it_works.md` per l'architettura).

## ✅ Fatto

- [x] Gioco base: mappa ufficio, fisica cannon-es, 5 armi a tema, pickup/drop,
      deathmatch con server autoritativo, HUD, respawn, killfeed, classifica (Tab)
- [x] **Fase 1 — Polish client**
  - [x] Barra della vita sugli avversari (nameplate canvas)
  - [x] Animazioni procedurali avatar: camminata, salto/caduta, rinculo allo sparo
  - [x] Mini-mappa (pianta generata dai corpi fisici + giocatori in tempo reale)
  - [x] Audio di prossimità (volume/pan per distanza e direzione), ambiente ufficio, passi
- [x] **Fase 2 — Identità**
  - [x] Selezione personaggio nella schermata iniziale (4 personaggi con accessori)
  - [x] Modelli migliorati (procedurali: cravatta, occhiali, cuffie, cappellino)
  - [x] Leaderboard kills persistente (`server/leaderboard.json` + `GET /leaderboard` + menu)
- [x] Deploy online: repo GitHub + blueprint Render (`render.yaml`), URL same-origin in produzione
- [x] ~~Fase 3 — Modalità di gioco (DM/TDM/CTF, squadre, bandiere, timer, fine partita)~~
      **costruita e poi RIMOSSA di proposito (12 giugno 2026)**: il gioco è tornato a un
      **free roam unico** — tutti nella stessa stanza, senza tempo né vincitore.
      Il codice delle modalità è recuperabile dalla history git se servirà.
- [x] **Modelli custom dei giocatori** (giugno 2026)
  - [x] GLB per personaggio in `client/public/assets/players/<id>/player.glb`
        (clip Idle/Shoot/Jump/Death/Run); il server scansiona le cartelle (`GET /characters`)
  - [x] Selezione personaggio dinamica con anteprima 3D in Idle nel menu
  - [x] Avatar remoti animati (corsa ∝ velocità, salto, sparo in overlay, morte a terra)
  - [x] Schermata di loading con barra di progresso e sfondo `assets/banner.png`
- [x] **Menu a pagine** (giugno 2026): banner + "Entra in ufficio" → selezione
      personaggio split-screen (primo piano su `player-bg.png`, frecce, nickname) →
      briefing (giocatori online, leaderboard, controlli, "Entra in partita")
- [x] **Tema UI militare** (giugno 2026): verdi oliva, font stencil, HUD coerente

## Lungo termine

- [ ] Sistema di progressione: livelli/XP da kill, abilità, personalizzazione
      (richiede identità persistente: account o nickname + storage; su Render serve un DB,
      il filesystem non è persistente)
- [ ] Leaderboard su database (oggi si azzera a ogni deploy su Render)
- [ ] Chat vocale di prossimità: WebRTC peer-to-peer con signaling via Socket.io,
      volume in funzione della distanza (la più complessa, quasi un progetto a sé)

## Trasversale (si può fare in qualsiasi momento)

- [ ] Nuove armi e oggetti (il sistema è data-driven: `client/src/weapons.js` + `server/data.js`)
      — idee: tazza di caffè (molotov), fermacarte (cecchino), scotch (rallenta)
- [ ] I due GLB attuali (pier/davide) sono identici: sostituire `davide/player.glb`
      con il modello vero quando c'è
- [ ] Modelli custom GLTF anche per armi/mappa (oggi solo i giocatori sono GLB)
- [ ] Spettatore dopo la morte / kill-cam
- [ ] Mobile / touch (oggi solo desktop con Pointer Lock)

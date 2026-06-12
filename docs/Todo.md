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

## 🔜 Fase 3 — Modalità di gioco (ristrutturazione server)

- [ ] Macchina a stati di partita sul server (modalità, punteggi, fine round)
- [ ] Team Deathmatch: squadre, spawn per team, colori avatar per squadra, punteggio di squadra
- [ ] Capture the Flag: bandiere fisiche, presa/consegna/recupero, HUD dedicato
- [ ] Selezione modalità (lato server o votazione in lobby)

> Da fare **prima** del matchmaking: le stanze dovranno dichiarare una modalità.

## Fase 4 — Più partite in parallelo

- [ ] Matchmaking / lobby: stanze multiple (Socket.io rooms), lista partite o quick join
      nella schermata iniziale, una istanza di gioco per stanza
- [ ] Valutare se serve davvero oltre l'uso con colleghi (per pochi giocatori basta una stanza)

## Fase 5 — Lungo termine

- [ ] Sistema di progressione: livelli/XP da kill, abilità, personalizzazione
      (richiede identità persistente: account o nickname + storage; su Render serve un DB,
      il filesystem non è persistente)
- [ ] Leaderboard su database (oggi si azzera a ogni deploy su Render)
- [ ] Chat vocale di prossimità: WebRTC peer-to-peer con signaling via Socket.io,
      volume in funzione della distanza (la più complessa, quasi un progetto a sé)

## Trasversale (si può fare in qualsiasi momento)

- [ ] Nuove armi e oggetti (il sistema è data-driven: `client/src/weapons.js` + `server/data.js`)
      — idee: tazza di caffè (molotov), fermacarte (cecchino), scotch (rallenta)
- [ ] Modelli custom GLTF (decisione aperta: oggi tutto è a primitive, zero asset esterni)
- [ ] Spettatore dopo la morte / kill-cam
- [ ] Mobile / touch (oggi solo desktop con Pointer Lock)

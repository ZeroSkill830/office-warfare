# How it works — Office Warfare

Documento tecnico per chi riprende in mano il progetto. Aggiornato a giugno 2026.

## Stack e comandi

- **Client**: Three.js 0.169 (rendering), cannon-es 0.20 (fisica), Vite (build/dev, porta 5173)
- **Server**: Node + Express + Socket.io 4.8 (porta 3001)
- **Zero asset esterni**: tutta la grafica è fatta di primitive Three.js, tutti i suoni
  sono sintetizzati con WebAudio

```bash
npm run setup    # installa root + server + client
npm run dev      # concurrently: server (3001) + Vite (5173)
npm run build    # build client in client/dist
npm start        # il server serve anche client/dist (modalità produzione)

# Test
node server/index.js &              # serve un server attivo per il test di integrazione
node server/test-clients.mjs        # 2 client simulati, 15 check (TEST_URL per altra porta)
node client/test-smoke.mjs          # fisica in Node senza DOM: mappa, player, proiettili
```

⚠️ **Su questa macchina (Mac di Piergiorgio)**: il Node di default è v12 con npm rotto.
Ogni comando shell va prefissato con `source ~/.nvm/nvm.sh && nvm use 22.19.0`.

## Architettura

```
client (browser)                     server (autoritativo)
─────────────────                    ─────────────────────
simulazione locale completa          stato dei giocatori (hp/kills/alive)
(fisica, proiettili, hit detect)     validazione colpi e pickup
        │                            morti, respawn, timer dei pickup
        ├── state  15 Hz ──────────► posizione/rotazione/arma
        ◄── states 20 Hz ──┤         broadcast di tutti gli stati
        ├── shoot ─────────► relay ► 'shot' agli altri client
        ├── hit ───────────► valida ► 'damaged' | 'death'
        └── pickup ────────► valida ► 'pickupTaken'
```

**Modello di autorità pragmatico**: i client simulano i proiettili e *segnalano* i
colpi (`hit`), ma il server li valida prima di applicare danno:
- ogni `shoot` registra uno `shotId` nella mappa `p.shots`; un `hit` è accettato solo
  se riferisce uno shot registrato, recente (< 4 s), della stessa arma e con meno hit
  del numero di pallini dell'arma (anti-cheat di base)
- i `pickup` sono accettati solo se il giocatore è entro `PICKUP_RADIUS` (3.5 m)
- hp, kill, morti, respawn (3 s, spawn più lontano dai nemici) e timer di respawn dei
  pickup (30 s armi / 15 s oggetti) vivono SOLO sul server
- solo il client **locale** rileva i propri colpi (`local: true` nei proiettili);
  i proiettili remoti sono solo visivi

## File per file

### server/
- **data.js** — tabella armi (danni/pallini), posizioni di `PICKUPS` (id w1-w8 armi,
  a1-a4 munizioni, m1-m4 medikit) e `SPAWN_POINTS`. Le coordinate dei pickup DEVONO
  combaciare con la mappa del client (`world.js`).
- **index.js** — tutto il server: join/state/shoot/hit/pickup/pickupDrop/dropWeapon/
  disconnect, leaderboard persistente (`leaderboard.json`, override con env `LB_FILE`),
  endpoint `GET /leaderboard`, static serving di `client/dist`, broadcast a 20 Hz.
  Whitelist dei personaggi in `CHARACTERS`.

### client/src/
- **main.js** — entry point e collante: input, game loop, tutti gli handler di rete,
  menu (nickname + selezione personaggio + leaderboard). Il loop: player.update →
  physics.step → world.sync → camera → weapons/projectiles/remotes/pickups/minimap →
  invio stato ogni 66 ms.
- **world.js** — mappa ufficio e fisica. Esporta `GROUP` (collision filter: WORLD=1,
  PLAYER=2, PROP=4, DEBRIS=8) e `createWorld(scene)` → `{ physics, props, bounceMat,
  sync }`. Corridoio x∈[-3,3] z∈[-22,22], 8 stanze con porte (gap nei muri) a
  z=-15,-5,5,15, perimetro a x=±11.1 z=±22.2. `staticBox()` crea mesh+corpo statico;
  le scrivanie ruotate usano `rot2()` per ruotare gli offset dei corpi. Le sedie sono
  dinamiche (massa 7, si ribaltano). `sync()` copia i trasform dei corpi sulle mesh.
- **player.js** — controller FPS: corpo cannon di DUE SFERE impilate (r 0.45, piedi
  +0.45 e testa +1.35, `fixedRotation`), `body.position` = piedi, occhi a +1.6.
  Movimento: blending della velocità verso il target (SPEED 9, `dt*25`), salto se
  `isGrounded()` (raycast verso il basso). ⚠️ Il giocatore ha un **materiale senza
  attrito** (ContactMaterial vs `defaultMaterial`): con l'attrito si "arrampicava"
  sui muri restando incastrato. Lo stop è gestito dal blending, non dall'attrito.
- **weapons.js** — `WEAPONS` (stats per arma: danno, cadenza, caricatore, riserva,
  ricarica, velocità, pallini, spread, gravità, icona), `makeWeaponMesh()` (modelli
  a primitive, usati per viewmodel/pickup/avatar), `WeaponSystem` (slot 1=mouse fisso,
  2=speciale; sparo, ricarica, animazione viewmodel agganciato alla camera).
  ⚠️ I callback (`onChanged` ecc.) ricevono l'istanza come argomento: NON riferire la
  variabile esterna, il primo callback parte durante il costruttore (TDZ).
- **projectiles.js** — balistica ibrida: proiettili integrati a mano (gravità per-arma)
  con raycast cannon contro WORLD|PROP + test segmento-vs-AABB contro i giocatori;
  la granata (tproll) è invece un vero corpo rigido con `bounceMat` (restituzione
  0.55) e miccia 1.8 s. `_explode` fa danno ad area con `scale = 1−d/raggio` e
  impulsi radiali sui corpi dinamici. `onExplosion(pos)` riceve la posizione.
- **remotes.js** — avatar remoti: gambe/braccia separate con pivot (geometrie
  traslate) per le animazioni procedurali (camminata da velocità stimata, posa
  aerea, rinculo via `onShot(id)`); nameplate canvas con nome + barra vita
  (`setHP`); palette e accessori dal personaggio (`characters.js`); `getTargets()`
  espone gli AABB per la hit detection; callback `onStep(pos)` per i passi udibili.
- **characters.js** — definizioni dei 4 personaggi (impiegato/manager/sistemista/
  stagista): colori + `addAccessories()` (cravatta, occhiali, cuffie, cappellino).
  Riferimenti avatar: testa y=1.6, busto y=1.05, fronte = -z.
- **pickups.js** — pickup fissi (fluttuano/ruotano, attivati/disattivati dal server)
  e drop (corpi fisici che cadono). `nearest(pos)` per il prompt "premi E".
- **minimap.js** — pianta generata UNA volta proiettando i corpi statici "alti"
  (halfExtents.y ≥ 0.9 = muri) su canvas; per frame disegna freccia giocatore
  (yaw 0 = -z = alto) e punti rossi per i nemici vivi.
- **hud.js** — DOM puro: hp, munizioni, slot armi (card con icona), killfeed,
  classifica, overlay morte (`death(nick)` testo, `deathTimer(s)` countdown —
  separati apposta, il timer si aggiorna ogni frame).
- **audio.js** — tutto sintetizzato. Suoni spazializzati: `spatial(pos)` calcola
  volume (1/(1+d²·0.012)) e pan stereo dalla posizione vs listener; il game loop
  chiama `audio.updateListener(x,y,z,yaw)` ogni frame. `startAmbient()` (ronzio
  neon + ventilazione) parte nell'`onInit` (serve il gesto utente per WebAudio).
- **net.js** — `serverUrl()`: porta 5173 (Vite dev) → `<host>:3001`, altrimenti
  same-origin (produzione: il server serve anche la pagina). `connect(nick, char,
  handlers)` mappa gli eventi su `on<Evento>`.

## Convenzioni e trappole note

- **Yaw 0 = guardare verso -z**; movimento: `vx=(-fwd·sin+str·cos)·SPEED`.
- ⚠️ **cannon-es: i ContactMaterial valgono solo se ENTRAMBI i corpi hanno un
  materiale.** Per questo `createWorld` assegna `physics.defaultMaterial` a tutti i
  corpi senza materiale (ultimo blocco prima del return). Senza quel loop, il
  materiale del giocatore e il rimbalzo delle granate non si applicano.
- I personaggi e le armi viaggiano come stringhe-id; il server fa whitelist
  (`CHARACTERS`, `WEAPONS`) — mai fidarsi del client.
- Il nickname è la chiave della leaderboard persistente (niente account).
- Eventi vs stato: posizione/arma viaggiano nello stato periodico; tutto ciò che è
  discreto (spari, danni, morti, pickup) viaggia come evento dedicato.
- Test di integrazione: i listener `once()` vanno creati PRIMA di emettere gli
  eventi che li scatenano (race già morse due volte).
- In dev il server NON è in watch mode (`dev: node index.js`): dopo modifiche al
  server va riavviato a mano.

## Deploy

- Repo: `https://github.com/ZeroSkill830/office-warfare` (branch `main`).
- Render blueprint in `render.yaml` (build: `npm run setup && npm run build`,
  start: `npm start`). Il server usa `process.env.PORT`.
- Piano free di Render: si addormenta dopo ~15 min di inattività; filesystem
  effimero → `leaderboard.json` si azzera a ogni deploy/riavvio (per persistenza
  vera serve un DB).
- In LAN: gli altri aprono `http://<IP-locale>:5173` (Vite ha `host: true`);
  firewall su 5173 + 3001.

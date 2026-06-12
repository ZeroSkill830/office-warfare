# Office Warfare 🏢🔫

FPS multiplayer in stile Call of Duty ambientato in un ufficio, giocabile nel browser.
Rendering con **Three.js**, fisica con **cannon-es**, multiplayer in tempo reale con **Socket.io**
(server autoritativo su danni, morti, respawn e pickup). Tutta la grafica è costruita con
primitive Three.js: nessun asset esterno da scaricare.

## Avvio rapido

Requisiti: Node.js 18+.

```bash
# 1. Installa le dipendenze (root + server + client)
npm run setup

# 2. Avvia server e client insieme
npm run dev
```

- Il **client** (Vite) è su `http://localhost:5173`
- Il **server** (Socket.io) è su porta `3001`

Apri `http://localhost:5173`, inserisci il nickname ed entra in partita.

## Giocare in più persone dalla rete locale

1. Trova l'indirizzo IP locale del computer che ospita il gioco:
   - **macOS**: `ipconfig getifaddr en0`
   - **Windows**: `ipconfig` (voce "Indirizzo IPv4")
   - **Linux**: `hostname -I`
2. Avvia il gioco con `npm run dev` su quel computer.
3. Gli altri giocatori aprono nel browser: `http://<IP-LOCALE>:5173`
   (es. `http://192.168.1.42:5173`). Il client si connette automaticamente al
   server Socket.io sulla porta `3001` dello stesso host.
4. Assicurati che il firewall consenta connessioni in ingresso sulle porte **5173** e **3001**.

### Build di produzione (opzionale)

```bash
npm run build     # build del client in client/dist
npm start         # il server serve anche la build su http://<IP>:3001
```

## Giocare online (deploy su Render)

Il repo include un blueprint `render.yaml`: il server Node serve sia il
multiplayer (Socket.io) sia la build statica del client, quindi basta un
singolo servizio web.

1. Vai su [render.com](https://render.com) e accedi (anche con GitHub).
2. **New → Blueprint** e seleziona questo repository: Render legge
   `render.yaml` e configura tutto da solo. In alternativa **New → Web
   Service** con build command `npm run setup && npm run build` e start
   command `npm start`.
3. A deploy finito condividi l'URL (es. `https://office-warfare.onrender.com`)
   con i tuoi colleghi: si gioca direttamente dal browser.

Note sul piano gratuito: il servizio si addormenta dopo ~15 minuti di
inattività (il primo accesso successivo impiega ~1 minuto a svegliarlo) e la
leaderboard persistente (`server/leaderboard.json`) si azzera a ogni deploy o
riavvio, perché il filesystem non è persistente.

## Controlli

| Tasto | Azione |
|---|---|
| `W A S D` | Movimento |
| Mouse | Visuale (Pointer Lock: clicca sulla scena per catturare il mouse) |
| Click sinistro | Spara |
| `R` | Ricarica |
| `Spazio` | Salta |
| `E` | Raccogli arma / munizioni / medikit |
| `1` / `2` | Cambia arma (mouse / arma raccolta) |
| `Tab` (tieni premuto) | Classifica |
| `Esc` | Rilascia il mouse |

## Armi (office warfare)

| Arma | Ruolo | Caratteristiche |
|---|---|---|
| 🖱️ Mouse | Pistola | Colpo singolo preciso, danno medio (arma iniziale) |
| ⌨️ Tastiera | Fucile a pompa | Rosa di 8 tasti, devastante a corta distanza |
| 📎 Graffettatrice | Mitragliatrice | Graffette veloci e tese, fuoco rapido |
| 🧻 Rotolo di carta | Lanciagranate | Vola ad arco, rimbalza ed esplode ad area |
| 🖊️ Penna | Coltello da lancio | Traiettoria balistica, danno alto |

Ogni arma ha danno, cadenza, caricatore, ricarica e velocità del proiettile distinti
(vedi `client/src/weapons.js`).

## Gameplay

- **Deathmatch** tutti contro tutti con classifica in tempo reale.
- Si parte solo con il mouse; le altre armi **spawnano sulle scrivanie e in fondo al
  corridoio**, fluttuando e ruotando. Si raccolgono con `E` e riappaiono dopo **30 secondi**.
- Alla morte si **lascia cadere l'arma** impugnata (corpo fisico raccoglibile dagli altri)
  e si fa **respawn dopo 3 secondi** in un punto lontano dai nemici.
- **Munizioni e medikit** sparsi nelle stanze (respawn in 15 secondi).
- Fisica reale: sedie che si ribaltano, oggetti spinti da proiettili ed esplosioni.

## Struttura del progetto

```
├── package.json          # script: setup, dev, build, start
├── server/               # backend autoritativo
│   ├── index.js          # Socket.io: stato, danni, morti, respawn, pickup
│   └── data.js           # tabella armi, posizioni pickup e spawn point
└── client/               # frontend (Vite + Three.js + cannon-es)
    └── src/
        ├── main.js       # entry point: loop di gioco, input, rete
        ├── world.js      # mappa ufficio (corridoio, stanze, arredi) + fisica
        ├── player.js     # controller FPS con corpo fisico
        ├── weapons.js    # definizioni armi, sparo/ricarica, viewmodel
        ├── projectiles.js# balistica, granate, esplosioni, danno
        ├── remotes.js    # avatar dei giocatori remoti + nickname
        ├── pickups.js    # pickup fluttuanti e armi droppate (fisiche)
        ├── hud.js        # vita, munizioni, killfeed, classifica
        ├── net.js        # connessione Socket.io
        └── audio.js      # effetti sonori sintetizzati (WebAudio)
```

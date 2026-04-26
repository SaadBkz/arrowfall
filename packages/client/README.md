# `@arrowfall/client`

Client navigateur — rendu PixiJS v8, capture clavier, boucle de jeu. **Aucune logique de jeu côté client** : toute la physique passe par `@arrowfall/engine`. Depuis la Phase 6, le serveur Colyseus tient la simulation autoritaire (`stepWorld` à 60 Hz côté serveur) et le client est en mode rendu pur lorsqu'il est en networked. Sans le toggle `?net=1`, le client tourne en hot-seat local (Phase 5).

## Lancer en local

```bash
pnpm --filter @arrowfall/client dev    # http://localhost:5173
pnpm --filter @arrowfall/client build  # bundle Vite dans dist/
pnpm --filter @arrowfall/client typecheck
pnpm --filter @arrowfall/client test   # vitest run (round-state + map fixtures)
```

Pré-requis : Node ≥ 20, pnpm ≥ 9, deps installées via `pnpm install` à la racine.

## Architecture

```
src/
├── main.ts                  # entry — boot Pixi.Application + Game.start(),
│                              parse `?net=1` flag → mode "local" | "networked"
├── style.css                # canvas crisp + body fullscreen
├── maps/                    # client-only map fixtures (server has its own copy)
│   ├── arena-01.json        # 2 spawns (default 2P)
│   ├── arena-02.json        # 4 spawns en quinconce (PLAYER_COUNT ≥ 3)
│   └── maps.test.ts
├── net/                     # Phase 6 — networked mode
│   ├── client.ts            # connectToArena() — colyseus.js wrapper, auto URL
│   ├── schema.ts            # client mirror of server's MatchState/Archer/Arrow
│   ├── match-mirror.ts      # matchStateToWorld(state, mapData) → engine.World
│   └── index.ts             # barrel
└── game/
    ├── index.ts             # class Game — owns stage, World, ticker, input,
    │                          PLAYER_COUNT (2..4), map switch, mode toggle
    ├── input.ts             # keyboard → ArcherInput per player
    ├── loop.ts              # fixed-timestep accumulator (60 Hz, local only)
    ├── colors.ts
    ├── round-state.ts
    ├── round-state.test.ts
    └── render/
        ├── tilemap.ts
        ├── archer.ts
        ├── arrow.ts
        ├── hud.ts           # +badge "online — N players" / "local — N players"
        └── round-message.ts
```

## Hot-seat — bindings clavier multi-joueurs

`PLAYER_COUNT` en tête de [`game/index.ts`](./src/game/index.ts) sélectionne 2..4 joueurs. Les ids sont assignés dans l'ordre de [`PLAYER_BINDINGS`](./src/game/input.ts) (p1, p2, p3, p4) → couleurs slot via `archerColorFor` (p1 rouge, p2 bleu, p3 vert, p4 jaune). Map auto : `arena-01` ≤ 2 joueurs, `arena-02` ≥ 3.

| Action | P1 (rouge) | P2 (bleu) | P3 (vert) | P4 (jaune) |
|---|---|---|---|---|
| Gauche | `←` | `A` | `Numpad4` | `;` |
| Droite | `→` | `D` | `Numpad6` | `'` |
| Haut | `↑` | `W` | `Numpad8` | `[` |
| Bas / fast-fall | `↓` | `S` | `Numpad5` | `]` |
| Saut | `Espace` | `F` | `Numpad0` | `/` |
| Tirer | `J` | `R` | `Numpad+` | `\` |
| Dodge | `K` | `T` | `NumpadEnter` | `.` |

| Reset (global) | `Backspace` |
|---|---|

> Décision : le reset a migré de `R` vers `Backspace` parce que `R` est désormais le tir de P2 (rangée AZERTY ZQSD-FRT). `Backspace` est globalement accessible et n'entre en conflit avec aucun binding joueur.

Les bindings utilisent `event.code` (layout-independent) : `KeyA`/`KeyW`/`KeyS`/`KeyD` sont les positions physiques « A »/« W »/« S »/« D » sur QWERTY, qui correspondent visuellement à « Q »/« Z »/« S »/« D » sur AZERTY. Donc le même fichier de bindings donne ZQSD pour le dev FR et WASD pour un test sur clavier US. Priorité aux flèches pour P1 (le projet est dev en AZERTY).

### Caveat — clavier au-delà de 2 joueurs

Les claviers PC ont du **N-key rollover** limité (souvent 6 touches simultanées max sur les claviers à matrice anti-ghost ; certains modèles bas de gamme tombent à 3-4). Au-delà de 2 joueurs, des combinaisons réalistes (P1 saute en tirant pendant que P3 court vers la droite et P2 esquive…) déclenchent du ghosting et des touches manquées. P3/P4 sont câblés et fonctionnent en sandbox, mais ne sont **pas validés ergonomiquement**. La résolution propre arrive en Phase 11 (gamepads via Gamepad API), où chaque joueur aura son propre périphérique.

## Notes d'implémentation

### Scaling

Le canvas plein écran (`resizeTo: window`) contient un `Container` racine `gameRoot` mis à l'échelle à l'entier le plus grand qui fait tenir 480×270 dans la fenêtre courante (`Math.floor(min(W/480, H/270))`). Le facteur entier seul préserve le pixel-art : un scaling fractionnaire introduirait du smearing même avec `image-rendering: pixelated`. Le playfield est centré (lettrage horizontal et vertical).

### Boucle de jeu (`game/loop.ts`)

Fixed-timestep accumulator. À chaque tick du Pixi `Ticker` (≈ 60–144 Hz selon le moniteur) :

1. `accumulator += ticker.deltaMS`
2. Tant que `accumulator >= 1000/60` ET `steps < 5` : `stepWorld()` puis `consumeEdges()` puis `accumulator -= 1000/60`.
3. Si on a saturé les 5 steps avec encore du backlog → on drop l'accumulateur (anti spiral of death).
4. Render après les steps (état le plus récent).

Le World est reassigné à chaque step (`stepWorld` est pur).

### Input — edges vs levels (multi-joueur)

`KeyboardInput` maintient un `Map<playerId, KeyState>` — une seule instance pour tout le clavier, paramétrée par `PLAYER_BINDINGS` (data-driven). Une frappe de touche met à jour le `KeyState` du seul joueur concerné (un même `event.code` n'est pas autorisé dans deux bindings — le résolveur n'a pas à choisir).

- **Levels** (`left/right/up/down/jumpHeld`) — true tant que la touche est down ; reset à `keyup`.
- **Edges** (`jump/dodge/shoot`) — true uniquement la frame du press ; clear via `consumeEdges(playerId)` après chaque `stepWorld`, pour CHAQUE joueur actif. Le keyboard auto-repeat (qui re-firerait `keydown` à 30 Hz) est filtré (`!e.repeat`) pour les edges.
- **Reset** — edge frame-level global (pas tick-level, pas par joueur), consommé via `consumeReset()` une fois par frame de render. N'importe quel joueur (ou un spectateur) peut presser `Backspace`.
- **Blur** — reset complet de tous les `KeyState`. Sans ça, alt-tab pendant qu'on tient une touche = la touche reste active à vie.

`keyStateToArcherInput()` est exporté pur pour faciliter les tests. `snapshot(playerId)` et `snapshotKeyState(playerId)` retournent l'état d'un joueur précis ; `snapshot(unknownId)` jette.

### Rendu

Tout en coordonnées logiques 480×270 — le scaling se fait au niveau du `gameRoot` Container. Chaque renderer maintient un `Graphics` réutilisable et fait `clear()` + redraw chaque frame (sauf `tilemap.ts` qui bake une fois). Pas d'assets pixel-art en Phase 4 — uniquement des rectangles colorés. Couleurs et helpers (`lighten`, `archerColorFor`) dans `colors.ts`.

Pour les flèches `flying`, l'orientation suit la vélocité via `Math.atan2(vy, vx)` — comme PixiJS Graphics ne supporte pas le transform par sous-élément, les 4 coins du rect 8×2 sont calculés manuellement et un `poly()` est dessiné. Les flèches `grounded`/`embedded` rendent à plat (l'angle de landing n'est pas stocké).

### Round end + win message

`getRoundOutcome(world)` ([`game/round-state.ts`](./src/game/round-state.ts)) est pur (pas d'import Pixi) — testé Vitest. Le freeze déclenche dès que `alive ≤ 1`, sans attendre la fin du `deathTimer`. La logique :

- `≥ 2` archers `alive=true` → `ongoing`
- `=== 1` → `win`, avec `winnerId`
- `=== 0` (kill simultané) → `draw` (pas de point — spec §7.1)

Le `RoundMessageRenderer` overlay est centré logiquement (240, 135), reste en sommet du `gameRoot`, et reste affiché jusqu'au reset. La fragmentation continue en arrière-plan jusqu'à `DEATH_DURATION_FRAMES` (le moteur despawne le corps ensuite).

Pas de score cumulé entre rounds — c'est Phase 8 (lobby + match).

## Tester

Vitest minimal côté client en Phase 5 :

- `game/round-state.test.ts` — 5 cas (ongoing / win / draw / roster vide / corps despawné)
- `maps/maps.test.ts` — parse + spawn-count assertions sur arena-01 et arena-02

```bash
pnpm --filter @arrowfall/client test
```

Pas de tests browser (Playwright/Cypress = trop d'overhead). L'engine reste **125/125 verts** ; aucune modif de `@arrowfall/engine` ou `@arrowfall/shared` dans cette phase (multi-archers déjà câblé Phase 3).

## Mode networked (Phase 6)

Le toggle URL `?net=1` bascule le client en mode réseau. Sans le flag, le hot-seat Phase 5 est inchangé.

```
http://localhost:5173/             → mode local (hot-seat 2-4P)
http://localhost:5173/?net=1       → mode networked (Colyseus arena room)
```

| | Local | Networked (`?net=1`) |
|---|---|---|
| `stepWorld` | client (60 Hz fixed-step) | serveur uniquement |
| Inputs | mappés sur 2-4 slots clavier | seul P1 (`←/→/↑/↓/Espace/J/K`) → `room.send("input")` |
| Reset (`Backspace`) | recrée le `World` local | `room.send("reset")` (dev only) |
| Joueurs | 2-4 sur le même clavier | 1 par onglet |
| Map | `arena-01` (2P) ou `arena-02` (≥3P) | `arena-01` |
| HUD badge | « local — N players » | « connecting… » → « online — N players » → « error: … » |

URL serveur :

1. `VITE_COLYSEUS_URL` (env) override tout.
2. Sinon, `import.meta.env.PROD` ? `wss://arrowfall-server.fly.dev` : `ws://localhost:2567`.

Sur erreur de connexion (server down, mismatch schéma, etc.), le HUD affiche « error: <message> » et la simulation locale ne tourne pas — recharger sans `?net=1` pour revenir au hot-seat.

### Schéma client (mirror du serveur)

`packages/client/src/net/schema.ts` redéclare `MatchState/ArcherState/ArrowState` à l'identique du serveur. `@colyseus/schema` exige des classes wire-compatibles aux deux extrémités (mêmes champs, même ordre, mêmes types primitifs). Drift = corruption silencieuse — toute modif d'un champ schéma doit être appliquée des deux côtés en lockstep.

### `useDefineForClassFields` — pourquoi `declare`

Les schémas utilisent `declare field: T;` au lieu de `field!: T;` parce que sous `useDefineForClassFields: true` (défaut TS pour `target: ES2022+`), même les définitions `field!:` émettent un `Object.defineProperty` qui shadow les getters/setters installés par `Schema.initialize`. Conséquence : les MapSchema/ArraySchema ne reçoivent pas leur `~childType` et l'encodage casse au premier patch. `declare` n'émet aucun champ — le prototype reste intact, les assignations dans le constructeur déclenchent les setters comme attendu par `@colyseus/schema`.

## Prediction + Reconciliation (Phase 7)

Phase 6 mettait le client en mirror pur du serveur — chaque input partait sur le wire et on attendait le snapshot retour avant de bouger l'archer. Avec une RTT > 50 ms le contrôle devenait gluant. Phase 7 met une **simulation prédictive locale** côté client (sur le même `stepWorld` déterministe que le serveur), réconciliée à chaque snapshot.

### Flow général

```
Render frame                         Server (autoritaire, 60 Hz step / 30 Hz patch)
─────────────────────                ────────────────────────────────────────────
input = snapshot(p1)                 onMessage("input")
clientTick = ++counter
pendingInputs.push({tick, input})    handleInput → inputs.set(slot, validated)
predicted = stepWorld(predicted, …)  lastClientTickBySession.set(session, t)
room.send("input", {…, clientTick})        ─────────►
                                     simulate (60 Hz)
                                     state.tick++
                                     state.lastInputTick.set(session, t)
                                            ◄─────────  patch (30 Hz)
onStateChange:
  reconcile(state, sessionId):
    drop pendingInputs ≤ ackedTick
    rebuild predicted ← matchStateToWorld(state)
    replay pendingInputs > ackedTick
    if |Δpos| > 4 px → arm correction lerp 4 frames
  ingest(state, sessionId)
    push (tick, snap) into per-session buffer (capacité 5)
                                                 
Render: predicted (local + arrows) + interpolated remotes (à serverTick - 2)
        + correction-offset décroissant sur l'archer local
```

### Stratégie

- **`clientTick`** — compteur monotone 1..N+, joint à chaque input wire (`{...input, clientTick}`). Le serveur le récupère via `validateClientTick`, range le plus haut vu par session dans `MatchState.lastInputTick` (MapSchema keyé sessionId, uint32). C'est le canal d'**ack** : un input ≤ `lastInputTick[mySessionId]` a été consommé côté serveur.
- **PredictionEngine** ([`net/prediction.ts`](./src/net/prediction.ts)) — détient `predictedWorld: World` (le World engine local), `pendingInputs: {tick, input}[]` borné à 120 (≈ 2 s à 60 Hz). À chaque fixed-step : push pending, `stepWorld(predicted, {[mySlot]: input})`, ship sur le wire. Les autres archers reçoivent `NEUTRAL_INPUT` côté local — leur position est de toute façon écrasée par l'interpolation au render.
- **reconcile()** — sur `onStateChange` : drop des pending acked, `predicted = matchStateToWorld(state)`, replay des pending restants. Si l'archer local a divergé de plus de **4 px** (`CORRECTION_DIVERGENCE_PX`) entre la position prédite avant reconcile et la position après, arme un offset de **correction lerp** sur **4 frames** (`CORRECTION_LERP_FRAMES`). L'offset se décrémente linéairement à chaque `stepLocal` ; le rendu l'**ajoute** à la position pour qu'on revienne en douceur, sans snap brutal.
- **RemoteInterpolator** ([`net/interpolation.ts`](./src/net/interpolation.ts)) — buffer de 5 snapshots par sessionId distant (`PerArcherBuffer`). Au render, on cible `latestServerTick - 2` (≈ 33 ms en arrière) et on lerp linéairement entre les deux entrées qui encadrent. Cold start (< 2 snapshots) → fallback rendu direct du dernier snapshot ; ne s'extrapolation pas. Les buffers se prunent quand une session quitte (la session disparaît du `state.archers`).
- **Composition** au render (`Game.composeRenderWorld`) — on part du `predictedWorld`, on remplace les archers non-locaux par leurs versions interpolées (sauf cold-start), puis on ajoute l'offset de correction sur l'archer local. Les flèches restent celles du `predictedWorld` — interpolation des flèches = Phase 9 si nécessaire.

### Tradeoffs vs rollback netcode

- **Rollback complet** (rejouer toutes les entités à partir d'un snapshot) est l'approche standard des fighting games — plus de fluidité, mais demande de désérialiser et de rejouer tous les acteurs sur chaque snapshot. Pas pour un MVP solo dev.
- L'approche Phase 7 reste **purement locale sur l'archer du joueur**. On ne tente pas de prédire le tir des adversaires ni les flèches qu'ils lancent — l'interpolation à -2 ticks gère ça. Conséquence : le combat *contre* un autre joueur reste à la latence du serveur (le hit reg passe par le serveur) ; seul le mouvement ressenti **localement** est instant.
- La **correction lerp à 4 frames** est un compromis : 4 frames = 67 ms à 60 Hz — dans la fenêtre où l'œil ne perçoit pas un déplacement comme un saut mais comme un glissement. Plus court → snap visible. Plus long → l'archer répond aux inputs *à la mauvaise position* pendant trop longtemps. Le seuil 4 px est un demi-tile : suffisant pour ignorer le bruit de drift sur des fields engine non-mirrorés (timers etc.) sans laisser le joueur partir en sucette en cas de vraie correction.
- L'`INTERPOLATION_DELAY_TICKS = 2` (≈ 33 ms à 30 Hz patch rate) compose avec le ping pour rester dans la spec §14.3 (« < 100 ms ressentie ») même en présence de jitter de paquet : on échange 33 ms de retard visuel sur les autres contre une absence de tremblement quand les patches arrivent groupés.

### Tests

- **Engine 125/125** inchangé — aucun nouveau cas dans `@arrowfall/engine`, c'est précisément la pureté du moteur qui rend la prédiction triviale.
- **Client 26/26** dont **19 nouveaux** :
  - `prediction.test.ts` (7 cas) — clientTick monotone, queue pending, drop acked, équivalence prédiction/server par déterminisme, replay des unacked, correction lerp armée + décroissance, pas de correction sur drift sub-seuil.
  - `interpolation.test.ts` (12 cas) — null sur buffer vide, fallback singleton, lerp entre paire bracketante, target hors-borne, sélection bonne paire en buffer 3+, exclusion local sessionId, target tick = latest - delay, clamp à 0, cold-start booléen, éviction quand > BUFFER_SIZE, pruning sur leave.
- **Server 34/34** dont **11 nouveaux** : `validateClientTick` (range / type / NaN / Infinity / overflow), `worldToMatchState.lastInputTick` (mirror + pruning + default empty), `ArenaRoom` (mirror du tick, monotonicité ack, pas d'avance sur payload malformé, drop sur leave).
- **Pas** de test browser ou de smoke automatisé — la validation finale reste manuelle (2 onglets `?net=1` sur Chrome avec throttling Slow 3G ; cf. critères d'acceptation Phase 7 du ROADMAP).

# ArrowFall — Roadmap

> Plan d'implémentation par phases. Chaque phase = un prompt Claude Code dédié, livré incrémentalement, testable de bout en bout.

## Phases

| Phase | Objectif | Livrable testable | Statut |
|---|---|---|---|
| **0** | Setup (ce prompt #1) | hello world déployé front + back | ✅ |
| **1** | Bootstrap engine — tilemap loader, types partagés, math 2D | tests Vitest verts sur `engine` | ✅ |
| **2** | Mouvement archer — gravité, marche, saut, dodge, wall-jump, wrap | suite de tests deterministes du `engine` | ✅ |
| **3** | Combat — flèches normales, tir, ramassage, stomp, catch, mort | tests + démo headless | ✅ |
| **4** | Rendu client local — PixiJS sprite, contrôle clavier, 1 archer | démo locale jouable solo | ✅ |
| **5** | Hot-seat 2-4 archers même clavier | démo locale 2-4 joueurs | ✅ |
| **6** | Colyseus state schema + sync naïve | 2 onglets, état partagé | ✅ |
| **7** | Client prediction + reconciliation + interpolation | latence ressentie < 100 ms | ✅ |
| **8** | Lobby, code de room 4 lettres, écran fin de round/match | match complet 2 joueurs distants | ⏳ |
| **9** | Coffres + flèches Bomb, Drill, Laser + Shield | mécaniques complètes | ⏳ |
| **10** | 3 maps designées + intégration assets pixel art CC0 | jeu visuel complet | ⏳ |
| **11** | SFX + musique CC0 + polish + gamepad + fullscreen | MVP livré | ⏳ |

## Phase 7 — Client prediction + reconciliation + interpolation (terminé)

✅ Livrée dans la PR `feat/prediction-reconciliation` : *(URL backfill après merge)*

- **Wire ack** : `MatchState.lastInputTick: MapSchema<uint32>` keyé par sessionId — chaque client envoie `{...input, clientTick}` à 60 Hz, le serveur range le plus haut tick reçu via `validateClientTick` (uint32 + Number.isInteger + range check ; `validateInput` reste pure côté shape engine). `worldToMatchState` mirror la map et la prune sur leave. Le compteur clientTick est monotone et survit aux resets (c'est un horloge locale, pas du round state).
- **PredictionEngine** ([`packages/client/src/net/prediction.ts`](packages/client/src/net/prediction.ts)) — détient `predictedWorld`, FIFO `pendingInputs` borné à 120, `localSlotId` résolu au premier `state.archers.get(sessionId)`. `stepLocal(input)` : push pending, `stepWorld(predictedWorld, {[mySlot]: input})`, ship sur le wire, décrémente le frame counter de la correction lerp. `reconcile(state, sessionId)` : drop pending acked, rebuild via `matchStateToWorld`, replay des restants ; si `|previousLocal.pos - newLocal.pos| > 4 px`, arme un offset de **correction lerp 4 frames** (linéaire, additif au rendu).
- **RemoteInterpolator** ([`packages/client/src/net/interpolation.ts`](packages/client/src/net/interpolation.ts)) — buffer de 5 snapshots par sessionId non-local, capture profonde des champs (les schema instances mutent en place sous nous). Render target = `latestServerTick - 2` (clamp à 0 au cold start). `interpolateBuffer` = lerp linéaire entre la paire bracketante, fallback vers oldest/newest hors-borne, snap des champs discrets (facing/state) sur la frame la plus récente. Cold start = < 2 snapshots → `Game` retombe sur la position prédite (jamais d'extrapolation).
- **Game.tickNetworked réécrit** : `runFixedStep` à 60 Hz drive `prediction.stepLocal(input)` au lieu de mirrorer le state ; `room.send("input", {...input, clientTick})` ; `composeRenderWorld()` superpose les archers interpolés + l'offset de correction sur l'archer local. Les flèches restent celles du predictedWorld (interpolation = Phase 9 si nécessaire).
- **Tradeoffs documentés** (`packages/client/README.md`) : pas de rollback netcode (trop pour un MVP solo), prédiction purement locale sur l'archer du joueur, hit reg toujours autoritaire serveur. Lerp 4 frames = 67 ms (sous le seuil de perception), seuil 4 px = demi-tile (ignore le bruit de drift sur les engine fields non-mirrorés timers/prevBottom).
- **Tests** : engine 125/125 inchangé + **client 26/26** (+19 nouveaux : `prediction.test.ts` 7 cas — monotonicité clientTick, drop pending acked, équivalence prédiction/server par déterminisme moteur, replay unacked, correction armée vs sub-seuil, décroissance — et `interpolation.test.ts` 12 cas — null/singleton/bracket-pair lerp, hors-borne, exclusion local, target tick, clamp 0, cold-start, éviction ring, pruning sur leave) + **server 34/34** (+11 nouveaux pour `validateClientTick`, mirror `lastInputTick`, monotonicité ack et drop sur leave dans `ArenaRoom`).
- Validation manuelle 2-onglets `?net=1` (à exécuter au merge) : sans throttling indistinguable du hot-seat ; sous Slow 3G le mouvement local reste réactif (cible spec §14.3 < 100 ms), les autres bougent en interpolé sans tremblement.

## Phase 6 — Colyseus state schema + sync naïve (terminé)

✅ Livrée dans la PR `feat/colyseus-sync` : *(URL backfill après merge)*

- **Mismatch Colyseus résolu (Option B)** : downgrade serveur en `colyseus@0.16.5` + `@colyseus/schema@^3.0.0`, aligné avec `colyseus.js@0.16.22`. `pnpm.overrides` racine pin tout l'écosystème (`@colyseus/core`, `auth`, `redis-driver`, `redis-presence`, `uwebsockets-transport`, `ws-transport`, `schema`) en 0.16.x — sinon les sub-packages remontaient du 0.17 en transitif. `colyseus.js@0.17` non publié sur npm au moment du choix.
- **State schema** (`packages/server/src/state/`) : `MatchState` (`tick: uint32`, `mapId: string`, `archers: MapSchema<ArcherState>` keyé par sessionId, `arrows: ArraySchema<ArrowState>`). Vec2 fields aplatis (`posX/posY` séparés) pour patcher proprement. `worldToMatchState(world, state, archerIdBySessionId)` mutateur idempotent — réutilise les instances pour minimiser la diff wire.
- **`ArenaRoom`** (`packages/server/src/rooms/`) : `maxClients=6`, `setSimulationInterval(simulate, 1000/60)` (60 Hz logique), `setPatchRate(1000/30)` (30 Hz broadcast). Mid-round join/leave : rebuild complet du World (les positions des autres joueurs se reset — Phase 8 fera mieux). `onMessage("input")` strict-validé, dernier wins ; `onMessage("reset")` gated `NODE_ENV !== "production"`. Le World autoritatif vit dans une propriété privée — l'état Colyseus est un *miroir* dérivé, pas la vérité.
- **Client networking** (`packages/client/src/net/`) : `client.ts` wrapper `colyseus.js` avec auto URL (`VITE_COLYSEUS_URL` > `wss://arrowfall-server.fly.dev` en prod > `ws://localhost:2567` en dev). `schema.ts` redéclare le schéma serveur en lockstep (drift = corruption). `match-mirror.ts` traduit `MatchState` vers le `World` engine pour réutiliser les renderers Phase 4/5 inchangés.
- **Toggle `?net=1`** dans `main.ts` : flippe `Game` en mode networked. Sans flag, hot-seat Phase 5 inchangé. En networked : seul P1 wired (clavier ergonomique), `stepWorld` jamais appelé localement, le World est rebuild à chaque frame depuis `room.state`. HUD badge « online — N players » / « connecting… » / « error: … ».
- **Bug critique trouvé en validation** : sous `useDefineForClassFields: true` (TS default ES2022+), les définitions `field!: T;` émettent un `Object.defineProperty` qui shadow les accessors installés par `Schema.initialize` — `~childType` n'arrive jamais sur les MapSchema/ArraySchema, `encodeAll` throw au premier patch. Fix : utiliser `declare field: T;` qui n'émet rien (constructor-body assignments fire les setters comme attendu par `@colyseus/schema`).
- **Validation cross-tab end-to-end** : 2 clients colyseus.js connectés au serveur local, voient les archers de l'autre, le mouvement de p1 (30 frames de walk-right de x=32 à x=139) est répliqué dans la vue de p2.
- **Tests** : engine 125/125 + client 7/7 (aucune régression) + **server 23/23 nouveaux** (vitest config dans `packages/server`, `validate-input.test.ts` 9 cas, `to-state.test.ts` 6 cas, `arena-room.test.ts` 8 cas — onJoin/onLeave/handleInput/simulate/state mirror/tick monotonicity).
- **Dockerfile** étendu pour copier `packages/{shared,engine}` (le serveur en a besoin maintenant) et utiliser `pnpm install --frozen-lockfile --filter @arrowfall/server...` (trois points = inclure les workspace deps).

## Phase 5 — Hot-seat 2-4 archers (terminé)

✅ Livrée dans la PR `feat/hot-seat` : <https://github.com/SaadBkz/arrowfall/pull/6>

- `@arrowfall/client/game/input.ts` réécrit en mapper N joueurs : une `KeyboardInput` unique maintient un `Map<playerId, KeyState>` et expose `snapshot(playerId)` / `consumeEdges(playerId)` ; `PLAYER_BINDINGS` data-driven (4 slots p1..p4 prêts) ; `consumeReset()` reste un edge global. Les `preventDefault` codes sont dérivés des bindings actifs (au-delà des 6 toujours bloqués : flèches/Espace/Backspace).
- **Conflit `KeyR`** (P1 reset vs P2 shoot) résolu en migrant le reset global vers `Backspace` — accessible à tous, sans collision avec les rangées P2 (FRT) ni P1 (J/K). Documenté README + ce ROADMAP.
- `game/round-state.ts` pur (`getRoundOutcome(world)` → `ongoing | win | draw`). Freeze policy : on flippe dès que ≤ 1 archer `alive=true`, sans attendre `DEATH_DURATION_FRAMES` — le winner est décidé à la frame de l'impact, la fragmentation est cosmétique. Vitest (5 cas).
- `game/render/round-message.ts` : Text PixiJS centré (logical 240×135), tinté à la couleur du slot du gagnant. Visible jusqu'au reset.
- `game/index.ts` : constante `PLAYER_COUNT = 2` (autorisée 1..4), bascule automatique de map (`arena-01` ≤ 2P, `arena-02` ≥ 3P), `Map<id, ArcherInput>` peuplée via `playerIds`, `consumeEdges(id)` pour chaque joueur après `stepWorld`.
- `maps/arena-02.json` : 30×17, 4 spawns en quinconce (un par quadrant), JUMPTHRU centrale 12 tiles + 2 jumpthrus latéraux + spike décoratif row 15.
- HUD multi-archers : 1 ligne par joueur, nom tinté à la couleur du corps via `archerColorFor`, footer (arrows count / fps / `[Backspace] reset`). Plus aucun débordement à 4P (7 lignes × 10 px = 70 px ≪ 270 px).
- Vitest configuré dans `@arrowfall/client` (script `test`) — `round-state.test.ts` (5 cas) + `maps.test.ts` (parse + 4 spawns en quinconce). 7 verts, ~480 ms. Engine reste 125/125, aucune régression.
- README racine + `packages/client/README.md` + ROADMAP à jour avec tableau des contrôles P1/P2 et caveat ghosting clavier > 2 joueurs (gamepads en Phase 11).

## Phase 4 — Rendu client local (terminé)

✅ Livrée dans la PR `feat/client-render` : <https://github.com/SaadBkz/arrowfall/pull/5>

- `@arrowfall/client` repensé : entry `main.ts` boote PixiJS v8 (antialias off, canvas crisp), une `class Game` orchestre l'app, et la simulation passe exclusivement par `stepWorld` de `@arrowfall/engine` — zéro logique de jeu côté client.
- Boucle de jeu **fixed-timestep accumulator** (`game/loop.ts`) : 60 Hz logique, framerate render variable (jusqu'à 144 Hz). Plafond de 5 ticks par frame contre le spiral of death après alt-tab/freeze.
- Mapper clavier (`game/input.ts`) avec distinction *edges* (jump/shoot/dodge — true 1 frame, acquittés par `consumeEdges()` après chaque step) vs *levels* (left/right/up/down/jumpHeld — true tant que tenu). Bindings basés sur `event.code` (layout-independent) avec priorité aux flèches pour AZERTY. Reset complet à `window.blur` (anti touche bloquée). `aimDirection` calculé via `inputDirection()` partagé.
- Rendu Graphics PixiJS uniquement (pas d'assets — Phase 10) en coordonnées logiques 480×270, scaled à l'entier le plus grand qui tient dans la fenêtre, lettrage centré : `tilemap.ts` (one-shot bake static), `archer.ts` (corps 8×11 + tête 8×3 lighter + pixel facing), `arrow.ts` (rect 8×2 rotated par `atan2(vy, vx)` pour les flying), `hud.ts` (Text top-left avec inventaire/alive/fps + `[R] reset`).
- Map jouable `arena-01.json` copiée du fixture engine, hot-reloadable via touche **R** (recrée le World à zéro).
- Engine 125/125 verts, aucune régression. Build Vite ≤ 250 KB gzippé total. Vercel auto-déploie au merge sur main.

## Phase 3 — Combat (terminé)

✅ Livrée dans la PR `feat/combat-arrows` : <https://github.com/SaadBkz/arrowfall/pull/4>

- `@arrowfall/shared` : `ArcherInput` étendu (`shoot` edge + `aimDirection: Direction8 | null`), helper `aimVector(input, facing)`, constantes Phase 3 (`SHOOT_COOLDOWN_FRAMES=8`, `ARROW_SPEED=5`, `MAX_INVENTORY=5`, `SPAWN_ARROW_COUNT=3`, `SPAWN_IFRAME_FRAMES=60`, `DEATH_DURATION_FRAMES=30`, `ARROW_GROUNDED_PICKUP_DELAY=10`, `HEAD_HITBOX_H=3`).
- `@arrowfall/engine/arrow` : `Arrow` (hitbox 8×2, statuts `flying`/`grounded`/`embedded`), `stepArrow` semi-implicit Euler clampé à `MAX_FALL_SPEED`, sweep SOLID-only (JUMPTHRU/SPIKE passables), wrap au seam, distinction floor-landing (`grounded`) vs wall-impact (`embedded`). `dropArrowsOnDeath` éjecte N flèches selon un schéma déterministe à N angles également espacés dans `(-π, 0)` — pas de PRNG.
- `@arrowfall/engine/archer` : `Archer` étendu (`inventory`, `shootCooldownTimer`, `alive`, `deathTimer`, `spawnIframeTimer`), `applyShoot` séparé (retourne `{ archer, newArrow }`), `stepArcher` court-circuite `!alive` et décrémente les nouveaux timers.
- `@arrowfall/engine/world` : `World = { map, archers, arrows, tick, events }` avec `stepWorld(world, inputs)` qui orchestre l'ordre canonique (shoot → step archers → step arrows → arrow/archer → stomp → pickup → drop on death → despawn corpses → tick++). Tri par id partout, hitbox tête = top 3 px, `WorldEvent` union (`arrow-fired`/`arrow-caught`/`archer-killed`/`arrow-picked-up`).
- 125 tests Vitest (< 1.5 s) dont le pivot **600 frames bit-identiques sur deux runs parallèles** (tolérance 0 sur pos/vel/inventaires/timers/events).
- Démo headless `pnpm demo:combat` (`scripts/demo-combat.ts`).

Note : SPIKE ↔ archer est laissé non-bloquant (comportement Phase 2). La cause `'spike'` existe dans `WorldEvent` pour que la Phase 4 le câble sans bump de schéma.

## Phase 2 — Mouvement archer (terminé)

✅ Livrée dans la PR `feat/archer-movement` : <https://github.com/SaadBkz/arrowfall/pull/3>

- `@arrowfall/shared` : `ArcherInput` (edges `jump`/`dodge`, levels `left`/`right`/`up`/`down`/`jumpHeld`) + `inputDirection()` qui mappe les 4 dpad vers `Direction8`.
- `@arrowfall/engine/physics/collide` : sweep axis-separated (`sweepX`/`sweepY`/`moveAndCollide`) + probes `isOnGround`/`isTouchingWall`, sémantique JUMPTHRU avec `prevBottom`, hitbox 8×11, wrap-aware via `tileAt`.
- `@arrowfall/engine/archer` : state machine `idle`↔`dodging`, modules pures `applyWalk`/`applyJump`/`applyDodge`/`applyFastFall` + orchestrateur `stepArcher`. Coyote (`JUMP_GRACE_FRAMES`), jump buffer (`JUMP_BUFFER_FRAMES`), wall-jump avec kick latéral. Iframe du dodge exposé en sortie pour la Phase 3.
- 91 tests Vitest (< 1 s) dont le pivot déterministe **600 frames bit-identiques sur deux runs parallèles** (tolérance 0).

## Phase 1 — Engine bootstrap (terminé)

✅ Livrée dans la PR `feat/engine-bootstrap` : <https://github.com/SaadBkz/arrowfall/pull/2>

- ESLint flat config + Prettier au niveau racine, scripts `pnpm lint` / `pnpm format`.
- `tsconfig.base.json` durci : `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- `@arrowfall/shared` : `Vec2`, `AABB`, helpers scalaires, `Direction8`, types tilemap (`MapData`, `MapJson`, mapping ASCII bijectif), constantes physiques (spec §2) et monde.
- `@arrowfall/engine` : tilemap loader (`parseMap` / `serializeMap`, validateur main-écrit), util grille wrap-aware (`tileAt`, `worldToTile`, `tileToWorld`, `wrapPosition`), `stepGravity` pur. Aucune dépendance externe hors `@arrowfall/shared`.
- 41 tests Vitest verts dont le test pivot **déterministe** de la gravité (deux runs parallèles bit-identiques sur 200 frames, table de valeurs calculée à la main jusqu'à la vélocité terminale).

## Phase 0 — Setup (terminé)

✅ Tout ce qui est fait dans la PR `feat/setup` :

- Repo GitHub initialisé : <https://github.com/SaadBkz/arrowfall>
- Monorepo pnpm avec 4 packages : `shared`, `engine`, `client`, `server`
- TypeScript strict (base + per-package configs)
- Hello world client PixiJS v8 + Vite 8 → **déployé Vercel** : <https://arrowfall-ten.vercel.app>
- Hello world serveur Colyseus 0.17 + tsx → **déployé Fly.io** (region `cdg`, 256 MB) : <https://arrowfall-server.fly.dev>
- Tests Vitest sanity sur `engine` (2/2 verts)
- Lint/format à brancher en Phase 1 (pas critique pour l'instant)

## Dette technique connue (à adresser plus tard)

### ✅ Mismatch de version Colyseus client/serveur — résolu en Phase 6

- **Décision** : downgrade serveur sur `colyseus@0.16.5` + `@colyseus/schema@^3.0.0`, aligné avec `colyseus.js@0.16.22` (client). `colyseus.js@0.17` n'étant pas publié sur npm, on choisit de baisser le serveur plutôt que d'attendre.
- **Mise en œuvre** : `pnpm.overrides` racine pin tout l'écosystème Colyseus (`@colyseus/core`, `auth`, `redis-driver`, `redis-presence`, `uwebsockets-transport`, `ws-transport`, `schema`) en 0.16.x — sinon les sous-packages d'autres dépendances Colyseus ramenaient du 0.17 en transitif.
- **À surveiller** : quand `colyseus.js@0.17` sortira, on pourra upgrade les deux côtés et retirer les overrides (post-MVP).

### 🟡 Pas encore de CI

- ESLint + Prettier ✅ branchés en Phase 1.
- Pas de GitHub Actions CI pour l'instant — à mettre quand on aura plus de tests.

## Comment piloter la suite

À la fin de cette session de setup, ouvre une nouvelle conversation Claude Code et demande :

> « Donne-moi le prompt #2 — Engine bootstrap (tilemap, math 2D, types partagés, premier test deterministe) ».

Une fois ce prompt exécuté et la PR mergée, enchaîne avec #3, etc. Garde un seul prompt actif à la fois pour bien valider chaque livrable.

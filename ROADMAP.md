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
| **5** | Hot-seat 2-4 archers même clavier | démo locale 2-4 joueurs | ⏳ |
| **6** | Colyseus state schema + sync naïve | 2 onglets, état partagé | ⏳ |
| **7** | Client prediction + reconciliation + interpolation | latence ressentie < 100 ms | ⏳ |
| **8** | Lobby, code de room 4 lettres, écran fin de round/match | match complet 2 joueurs distants | ⏳ |
| **9** | Coffres + flèches Bomb, Drill, Laser + Shield | mécaniques complètes | ⏳ |
| **10** | 3 maps designées + intégration assets pixel art CC0 | jeu visuel complet | ⏳ |
| **11** | SFX + musique CC0 + polish + gamepad + fullscreen | MVP livré | ⏳ |

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

### 🔴 Mismatch de version Colyseus client/serveur (à régler en Phase 7)

- **Symptôme** : ouvrir le client déployé → la console affichera `[colyseus] connection failed` lors du `joinOrCreate("hello")`.
- **Cause** : `colyseus` (server) est en **0.17.10** (latest npm), mais `colyseus.js` (client SDK) est en **0.16.22** (latest npm). Les deux n'ont pas le même protocole wire.
- **Impact actuel** : la **chaîne de déploiement** (Vercel + Fly.io) fonctionne, le serveur répond en HTTP, le client build et se sert correctement. Mais l'établissement d'une room WebSocket échoue.
- **Résolution prévue en Phase 7** (Colyseus state schema + sync) : soit attendre que `colyseus.js@0.17` soit publié sur npm, soit downgrader proprement le serveur en `colyseus@0.16` avec tous les sub-packages alignés (overrides pnpm + clean reinstall). À ce moment-là on pourra valider la connexion réelle.
- **Ce que ça ne bloque pas** : Phases 1-6 (engine pur, mouvement, combat, rendu local, hot-seat) — aucun réseau impliqué. On peut tout coder et tester sans toucher au serveur.

### 🟡 Pas encore de CI

- ESLint + Prettier ✅ branchés en Phase 1.
- Pas de GitHub Actions CI pour l'instant — à mettre quand on aura plus de tests.

## Comment piloter la suite

À la fin de cette session de setup, ouvre une nouvelle conversation Claude Code et demande :

> « Donne-moi le prompt #2 — Engine bootstrap (tilemap, math 2D, types partagés, premier test deterministe) ».

Une fois ce prompt exécuté et la PR mergée, enchaîne avec #3, etc. Garde un seul prompt actif à la fois pour bien valider chaque livrable.

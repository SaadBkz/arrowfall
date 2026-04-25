# `@arrowfall/client`

Client navigateur — rendu PixiJS v8, capture clavier, boucle de jeu. **Aucune logique de jeu** : toute la physique passe par `@arrowfall/engine` (la même que le serveur autoritatif tournera en Phase 6).

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
├── main.ts                  # entry — boot Pixi.Application + Game.start()
├── style.css                # canvas crisp + body fullscreen
├── maps/
│   ├── arena-01.json        # 2 spawns (default 2P)
│   ├── arena-02.json        # 4 spawns en quinconce (PLAYER_COUNT ≥ 3)
│   └── maps.test.ts         # parse + spawn-count assertions
└── game/
    ├── index.ts             # class Game — owns stage, World, ticker, input,
    │                          PLAYER_COUNT (2..4), map switch
    ├── input.ts             # keyboard → ArcherInput per player (Map<id, KeyState>)
    │                          PLAYER_BINDINGS data-driven, blur reset
    ├── loop.ts              # fixed-timestep accumulator (60 Hz logique)
    ├── colors.ts            # palette unifiée + archerColorFor(id, slot)
    ├── round-state.ts       # pure getRoundOutcome(world) → ongoing/win/draw
    ├── round-state.test.ts  # vitest cases
    └── render/
        ├── tilemap.ts       # static bake d'une MapData via Graphics
        ├── archer.ts        # corps 8×11 + tête 8×3 + facing pixel
        ├── arrow.ts         # rect 8×2 rotated (flying) ou flat (grounded)
        ├── hud.ts           # Text top-left, 1 line par joueur (couleur du slot)
        └── round-message.ts # « PX wins! » / « Draw! » centré
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

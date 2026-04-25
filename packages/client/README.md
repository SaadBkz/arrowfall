# `@arrowfall/client`

Client navigateur — rendu PixiJS v8, capture clavier, boucle de jeu. **Aucune logique de jeu** : toute la physique passe par `@arrowfall/engine` (la même que le serveur autoritatif tournera en Phase 6).

## Lancer en local

```bash
pnpm --filter @arrowfall/client dev    # http://localhost:5173
pnpm --filter @arrowfall/client build  # bundle Vite dans dist/
pnpm --filter @arrowfall/client typecheck
```

Pré-requis : Node ≥ 20, pnpm ≥ 9, deps installées via `pnpm install` à la racine.

## Architecture

```
src/
├── main.ts                  # entry — boot Pixi.Application + Game.start()
├── style.css                # canvas crisp + body fullscreen
├── maps/
│   └── arena-01.json        # map MVP (importée en JSON natif via Vite)
└── game/
    ├── index.ts             # class Game — owns stage, World, ticker, input
    ├── input.ts             # keyboard → ArcherInput (edges + levels + blur reset)
    ├── loop.ts              # fixed-timestep accumulator (60 Hz logique)
    ├── colors.ts            # palette unifiée
    └── render/
        ├── tilemap.ts       # static bake d'une MapData via Graphics
        ├── archer.ts        # corps 8×11 + tête 8×3 + facing pixel
        ├── arrow.ts         # rect 8×2 rotated (flying) ou flat (grounded)
        └── hud.ts           # Text top-left
```

## Contrôles

| Action | Touche primaire | Alternative |
|---|---|---|
| Gauche | `←` | `A`, `Q` |
| Droite | `→` | `D` |
| Haut | `↑` | `W`, `Z` |
| Bas / fast-fall | `↓` | `S` |
| Saut | `Espace` | — |
| Tirer | `J` | — |
| Dodge | `K` | — |
| Reset round | `R` | — |

Les bindings utilisent `event.code` (layout-independent) — priorité aux flèches car le projet est dev en AZERTY.

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

### Input — edges vs levels

`KeyboardInput` maintient un `KeyState` mutable :

- **Levels** (`left/right/up/down/jumpHeld`) — true tant que la touche est down ; reset à `keyup`.
- **Edges** (`jump/dodge/shoot`) — true uniquement la frame du press ; clear via `consumeEdges()` après chaque `stepWorld`. Le keyboard auto-repeat (qui re-firerait `keydown` à 30 Hz) est filtré (`!e.repeat`) pour les edges.
- **Reset** — edge frame-level (pas tick-level), consommé via `consumeReset()` une fois par frame de render.
- **Blur** — reset complet du `KeyState`. Sans ça, alt-tab pendant qu'on tient une touche = la touche reste active à vie.

`keyStateToArcherInput()` est exporté pur pour faciliter les tests futurs.

### Rendu

Tout en coordonnées logiques 480×270 — le scaling se fait au niveau du `gameRoot` Container. Chaque renderer maintient un `Graphics` réutilisable et fait `clear()` + redraw chaque frame (sauf `tilemap.ts` qui bake une fois). Pas d'assets pixel-art en Phase 4 — uniquement des rectangles colorés. Couleurs et helpers (`lighten`, `archerColorFor`) dans `colors.ts`.

Pour les flèches `flying`, l'orientation suit la vélocité via `Math.atan2(vy, vx)` — comme PixiJS Graphics ne supporte pas le transform par sous-élément, les 4 coins du rect 8×2 sont calculés manuellement et un `poly()` est dessiné. Les flèches `grounded`/`embedded` rendent à plat (l'angle de landing n'est pas stocké).

## Tester

Pas de tests browser en Phase 4 (Playwright/Cypress = trop d'overhead pour la valeur). Le mapper `keyStateToArcherInput` est exposé pur pour tests Vitest futurs si nécessaire.

L'engine reste **125/125 verts** ; aucune modif de `@arrowfall/engine` ou `@arrowfall/shared` dans cette phase.

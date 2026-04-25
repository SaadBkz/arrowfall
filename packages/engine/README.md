# `@arrowfall/engine`

Simulation **pure** du jeu : pas de DOM, pas de réseau, pas de Node-only. Tout ce que ce package exporte doit pouvoir tourner identiquement côté client (prédiction locale) et serveur (autoritatif).

## Règles dures

- Aucun import externe sauf `@arrowfall/shared`.
- Aucun `Date.now()`, `Math.random()` non seedé, ni ordre d'itération non spécifié sur Map/Set dans la simulation.
- Toutes les fonctions exposées sont **pures** (retournent une nouvelle valeur, ne mutent pas l'entrée). Les types d'état (`Body`, `MapData`, …) sont marqués `readonly`.

## Lancer la suite de tests

```bash
pnpm --filter @arrowfall/engine test
```

## Exemple — charger une map

```ts
import { parseMap, tileAt } from "@arrowfall/engine";
import type { MapJson } from "@arrowfall/shared";
import json from "./my-map.json" with { type: "json" };

const map = parseMap(json as MapJson);

// Wrap-aware lookup. (-1, -1) renvoie la cellule (29, 16).
const kind = tileAt(map, -1, -1);
```

## Exemple — un pas de gravité

```ts
import { stepGravity, type Body } from "@arrowfall/engine";

let body: Body = { pos: { x: 100, y: 0 }, vel: { x: 0, y: 0 } };
for (let i = 0; i < 60; i++) body = stepGravity(body);
// Au-delà de la frame 14, body.vel.y reste clampé à MAX_FALL_SPEED (4 px/frame).
```

## Archer state machine (Phase 2)

`stepArcher(archer, input, map)` est l'API publique pour avancer l'état d'un archer d'une frame. Pure — ne mute rien, ne touche pas au DOM, ne lit pas l'horloge. La hitbox de l'archer est ancrée par son coin top-left :

```
   pos.x
    │
    ▼
  ┌────────┐  ← pos.y      (8 px de large × 11 px de haut, spec §2.6)
  │        │
  │ archer │
  │        │
  │        │
  └────────┘  ← pos.y + 11
    │      │
    ▲      ▲
    pos.x  pos.x + 8
```

Ordre d'opérations interne (load-bearing pour le déterminisme) :

1. Sonder l'environnement (`isOnGround`, `isTouchingWall` × 2).
2. `applyDodge` — peut transitionner `idle` → `dodging` et écraser `vel`.
3. Si pas en dodge : `applyWalk` → `applyJump` (coyote / buffer / wall-jump) → gravité → `applyFastFall`.
4. Cache `prevBottom` (= `pos.y + 11`) pour la sémantique JUMPTHRU de la frame.
5. `moveAndCollide` (sweepX puis sweepY) → annule `vel.x` ou `vel.y` à l'impact.
6. Décrémentation des timers (coyote/buffer ne décrémentent pas le frame où ils sont rechargés — sinon off-by-one).
7. `wrapPosition` finale.

```ts
import { createArcher, parseMap, stepArcher } from "@arrowfall/engine";
import type { ArcherInput, MapJson } from "@arrowfall/shared";
import json from "./my-map.json" with { type: "json" };

const map = parseMap(json as MapJson);
let archer = createArcher("p1", { x: 32, y: 16 });

// Une frame d'input: dodge horizontal vers la droite.
const input: ArcherInput = {
  left: false, right: true, up: false, down: false,
  jump: false, dodge: true, jumpHeld: false,
};

archer = stepArcher(archer, input, map);
// → archer.state === 'dodging', vel = (DODGE_SPEED, 0), iframes armés.
```

`stepGravity` reste exporté pour les corps non-archers (flèches, particules) — Phase 3 s'en sert.

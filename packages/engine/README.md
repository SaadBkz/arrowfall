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

La collision tilemap arrive en Phase 2 — `stepGravity` est juste la primitive d'accélération.

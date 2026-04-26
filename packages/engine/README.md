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

## Combat (Phase 3)

`stepWorld(world, inputs)` est le nouvel orchestrateur central — il combine archers, flèches et map en un état pur et exécute un pas de simulation à 60 Hz. Il appelle `applyShoot` puis `stepArcher` puis `stepArrow` puis résout les collisions selon **un ordre canonique trié par id alphabétique** (load-bearing pour le déterminisme client/serveur).

```ts
import {
  createWorld,
  parseMap,
  stepWorld,
  type World,
} from "@arrowfall/engine";
import { type ArcherInput, NEUTRAL_INPUT, TILE_SIZE } from "@arrowfall/shared";
import json from "./my-map.json" with { type: "json" };

const map = parseMap(json);
const spawns = map.spawns.map((s) => ({ x: s.x * TILE_SIZE, y: s.y * TILE_SIZE }));
let w: World = createWorld(map, spawns, ["p1", "p2"]);

const inputs = new Map<string, ArcherInput>([
  ["p1", { ...NEUTRAL_INPUT, shoot: true, aimDirection: "E" }],
  ["p2", NEUTRAL_INPUT],
]);
w = stepWorld(w, inputs); // → w.events contains an arrow-fired event for p1.
```

### Ordre d'itération `stepWorld`

1. Snapshot des ids triés par ordre alphabétique.
2. `applyShoot` par archer (suffix d'id = `${tick}`).
3. `stepArcher` par archer (physique + décrément des timers).
4. `stepArrow` par flèche existante (triée par id).
5. Résolution arrow ↔ archer : self-friendly-fire ignoré, `spawnIframeTimer > 0` → pass-through, `dodgeIframeTimer > 0` → catch (+1 inv clampé), sinon kill + embed.
6. Stomp : `A.vel.y > 0` ET `head(B) ∩ body(A)` → B meurt + A rebondit (`STOMP_BOUNCE_VELOCITY`). Iframe spawn/dodge sur B annule le stomp.
7. Pickup : flèches `grounded`/`embedded` avec `groundedTimer === 0` → `+1` inv, flèche disparaît.
8. Drop : chaque archer mort cette frame éjecte ses flèches via `dropArrowsOnDeath` (schéma déterministe N angles dans `(-π, 0)`, pas de PRNG).
9. Despawn des corps avec `deathTimer >= DEATH_DURATION_FRAMES`.
10. `tick += 1`.

### Hitboxes (spec §2.6)

```
   pos.x
    │
    ▼
  ┌────────┐  ← pos.y           ╲ tête : 8 × 3 px (top), cible du stomp
  │ tête   │  ← pos.y + 3       ╱
  │        │
  │ corps  │                     corps : 8 × 11 px (hitbox principale)
  │        │
  │        │
  └────────┘  ← pos.y + 11
    8 px

  ┌────────┐  ← arrow.pos.y     flèche : 8 × 2 px
  │ flèche │
  └────────┘  ← arrow.pos.y + 2
```

La hitbox tête est juste le sous-AABB des 3 px supérieurs du corps — pas un type séparé. Le résolveur stomp la fabrique à la volée dans `stepWorld`. La flèche partage la convention top-left, ignore JUMPTHRU et SPIKE pour cette phase, et plante (`embedded`) ou se pose (`grounded`) sur le premier SOLID rencontré, avec un cooldown de 10 frames avant pickup.

### Démo headless

```bash
pnpm demo:combat
# → 600 frames de trace : tick=N | p1: pos=(x,y) inv=I alive=Y/N | p2: ... | events=[...]
```

## Types de flèches (Phase 9a/9b)

`ArrowType` est canoniquement défini dans `@arrowfall/shared/constants/arrows` (re-exporté depuis l'engine pour back-compat). Chaque type a un profil dans `ARROW_PROFILES` qui pilote `stepArrow` :

| Type | Speed (px/frame) | Gravity | Impact mode | Spec ref |
|---|---|---|---|---|
| `normal` | 5.0 | oui | `embed` (grounded sur sol, embedded sur mur) | §4.2 |
| `bomb` | 4.5 | oui | `explode` (au mur OU `age >= 60` → blast AABB ±24 px) | §4.2 |
| `drill` | 5.0 | oui | `pierce` (1× SOLID puis fallback `embed`) | §4.2 |
| `laser` | 7.0 | non | `bounce` (jusqu'à 7×, puis despawn ; ou `age >= 30`) | §4.2 |

**Bramble** et **Feather** sont explicitement hors-MVP (spec §13).

### Inventaires par type (Phase 9b)

L'archer a 4 compteurs séparés + 1 booléen :

```ts
archer.inventory       // normal arrows (spawn = SPAWN_ARROW_COUNT, cap MAX_INVENTORY)
archer.bombInventory   // bomb arrows (cap MAX_INVENTORY)
archer.drillInventory  // drill arrows (cap MAX_INVENTORY)
archer.laserInventory  // laser arrows (cap MAX_INVENTORY)
archer.hasShield       // boolean — absorbe un coup mortel puis se brise
```

`applyShoot` priorité **laser > drill > bomb > normal** : tirer alors qu'on a au moins une flèche spéciale dans le sac consomme la spéciale. C'est l'UX "loot impactful" — un joueur qui ramasse un drill veut le tirer maintenant.

### Shield consume hit

Quand un archer avec `hasShield=true` reçoit un coup mortel (arrow direct, blast bomb, stomp), `stepWorld` flippe `hasShield=false` au lieu de tuer et émet `WorldEvent.shield-broken { victimId, cause: "arrow"|"bomb"|"stomp" }`. Le stompeur rebondit même contre une cible shielded (l'impact mécanique reste). Friendly fire respecté : sa propre bomb consomme son propre shield.

### Coffres (`@arrowfall/engine/chest`)

`ChestContents` est une union discriminée :

```ts
type ChestContents =
  | { kind: "arrows"; type: ArrowType; count: number }
  | { kind: "shield" };
```

Le serveur (`ChestSpawner`) tire le contenu via `Math.random` non-seedé (cohérence cross-client garantie par broadcast autoritaire — pas par un seed partagé) selon la table spec §6.2 : 50% normal×2 / 20% bomb×2 / 15% drill×2 / 10% laser×2 / 5% shield. L'engine est pur — il ne fait que livrer le contenu à l'opener quand `openTimer` atteint 0.

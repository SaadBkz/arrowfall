# ArrowFall — Asset Credits

## Stratégie

**Hybride CC0** depuis Phase 10.5b : un seul pack pixel art CC0 vendoré (Kenney's Tiny Dungeon) fournit les tiles SOLID + le sprite archer base ; tout le reste (backgrounds, frames, vignette, fog, decorations, arrows, chests, shields) est généré procéduralement au démarrage par le code TypeScript sous `packages/client/src/assets/`.

## Pack tiers — Tiny Dungeon (Kenney)

- **Source** : <https://kenney.nl/assets/tiny-dungeon>
- **Auteur** : Kenney Vleugels (kenney.nl)
- **Licence** : CC0 1.0 Universal (Public Domain)
- **Vendoré sous** : `packages/client/public/assets/cc0/kenney/tiny-dungeon.png` + `tiny-dungeon-LICENSE.txt`
- **Format** : 12 cols × 11 rows de tiles 16×16 px, gap 1 px (5.5 KB)
- **Utilisation dans ArrowFall** :
  - 4 tiles de pierre (rows 1-3 de la grille) → `SOLID_0..3` par thème, multipliés par un `theme tint` à la génération.
  - 1 tile knight (row 7 col 1) → archer body, multiplié par le `skin tint` pour les 6 slots.
- **Code intégration** : `cc0-loader.ts` (slice + tint), `cc0-mapping.ts` (table d'indices + tints), `cc0-tiles.ts`, `cc0-archers.ts`.

## Liste des assets et leur source

| Asset | Source | Auteur | Licence |
|---|---|---|---|
| **SOLID tiles 0..3** (3 thèmes × 4 variantes, theme-tinted) | `cc0-tiles.ts` slicing `tiny-dungeon.png` | Kenney Vleugels | CC0 |
| **Archer body sprite** (1 base × 6 skin tints) | `cc0-archers.ts` slicing `tiny-dungeon.png` | Kenney Vleugels | CC0 |
| Tiles SOLID_4..7 + SOLID_FACE + JUMPTHRU + SPIKE (3 thèmes) | `tile-painter.ts` + `palettes.ts` | ArrowFall procedural generator | CC0 |
| Frame panels 32×270 (3 thèmes × 2 sides) | `frame-painter.ts` | ArrowFall procedural generator | CC0 |
| Vignette 480×270 RGBA | `vignette-painter.ts` | ArrowFall procedural generator | CC0 |
| Fog 256×270 tileable (3 thèmes) | `fog-painter.ts` | ArrowFall procedural generator | CC0 |
| Backgrounds 480×270 (3 thèmes × 2 layers) | `background-painter.ts` | ArrowFall procedural generator | CC0 |
| Decorations (3 thèmes × ~7 props) | `decoration-painter.ts` | ArrowFall procedural generator | CC0 |
| Arrows normal/bomb/drill/laser | `arrow-painter.ts` | ArrowFall procedural generator | CC0 |
| Chests + 6 opening frames | `chest-painter.ts` | ArrowFall procedural generator | CC0 |
| Shield ring + sigils overlay | `shield-painter.ts` | ArrowFall procedural generator | CC0 |

## Inspiration créative (non-redistribuée)

- **TowerFall Ascension / Dark World** (Matt Thorson, Maddy Makes Games) — étalon visuel et ressenti gameplay. Aucun asset extrait. Voir `docs/moodboard/README.md` pour la liste des niveaux référencés.

## Audio

Vide pour l'instant — Phase 11 ajoutera les SFX et la musique CC0 (sources : Free Music Archive, OpenGameArt). Cette section sera enrichie à ce moment-là.

## Licence des assets générés

Code générateur sous la licence du projet (voir LICENSE racine). Les assets produits par ce code sont publiés en **CC0 1.0 Universal** (domaine public). Vous pouvez les extraire et les réutiliser librement, avec ou sans attribution.

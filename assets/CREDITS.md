# ArrowFall — Asset Credits

## Stratégie

**100% procédural CC0**. Aucun fichier d'asset binaire (PNG/WAV/OGG) n'est versionné dans ce repo. Tous les visuels sont générés au démarrage du client par le code TypeScript sous `packages/client/src/assets/`.

## Liste des assets générés et leur source

| Asset | Source | Auteur | Licence |
|---|---|---|---|
| Tilesheet `sacred-grove` (8 tiles) | `packages/client/src/assets/tile-painter.ts` + `palettes.ts` | ArrowFall procedural generator | CC0 |
| Tilesheet `twin-spires` (8 tiles) | idem | idem | CC0 |
| Tilesheet `old-temple` (8 tiles) | idem | idem | CC0 |
| Spritesheet Verdant (~40 frames) | `packages/client/src/assets/archer-painter.ts` | ArrowFall procedural generator | CC0 |
| Spritesheet Crimson (~40 frames) | idem | idem | CC0 |
| Spritesheet Azure (~40 frames) | idem | idem | CC0 |
| Spritesheet Saffron (~40 frames) | idem | idem | CC0 |
| Spritesheet Onyx (~40 frames) | idem | idem | CC0 |
| Spritesheet Frost (~40 frames) | idem | idem | CC0 |
| Arrow sprites normal/bomb/drill/laser | `packages/client/src/assets/arrow-painter.ts` | ArrowFall procedural generator | CC0 |
| Chest sprite + 6 opening frames | `packages/client/src/assets/chest-painter.ts` | ArrowFall procedural generator | CC0 |
| Background Sacred Grove (parallax ×2) | `packages/client/src/assets/background-painter.ts` | ArrowFall procedural generator | CC0 |
| Background Twin Spires (parallax ×2) | idem | idem | CC0 |
| Background Old Temple (parallax ×2) | idem | idem | CC0 |
| Shield ring + sigils overlay | `packages/client/src/assets/shield-painter.ts` | ArrowFall procedural generator | CC0 |

## Inspiration créative (non-redistribuée)

- **TowerFall Ascension / Dark World** (Matt Thorson, Maddy Makes Games) — étalon visuel et ressenti gameplay. Aucun asset extrait. Voir `docs/moodboard/README.md` pour la liste des niveaux référencés.

## Audio

Vide pour l'instant — Phase 11 ajoutera les SFX et la musique CC0 (sources : Free Music Archive, OpenGameArt). Cette section sera enrichie à ce moment-là.

## Licence des assets générés

Code générateur sous la licence du projet (voir LICENSE racine). Les assets produits par ce code sont publiés en **CC0 1.0 Universal** (domaine public). Vous pouvez les extraire et les réutiliser librement, avec ou sans attribution.

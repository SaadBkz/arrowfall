// Phase 10.5b — Logical → CC0-grid index mapping.
//
// Centralises the (row, col) coordinates we use from Tiny Dungeon for
// each gameplay role (SOLID stone variants, archer body, etc.).
// Mapping was determined by inspecting the individual tile_NNNN.png
// files extracted from the pack — see ROADMAP Phase 10.5b for the
// research notes.
//
// Per-theme tinting: instead of having 3 sets of tiles, we use the
// same 4 SOLID variants and apply a multiplicative `Sprite.tint` at
// render-time. This keeps the CC0 footprint at one tiny PNG (5.5 KB).

import type { ThemeId } from "@arrowfall/shared";
import type { ArcherSkinId } from "./palettes.js";

export type GridPos = { readonly col: number; readonly row: number };

// 4 distinct stone variants — used for the 4 SOLID tile slots.
// Picked from the Tiny Dungeon "stone wall" cluster (rows 0-3) by
// inspecting individual tile PNGs: clean brick, brick-with-shadow,
// alt-pattern, heavy-shadow.
export const TD_SOLID_VARIANTS: ReadonlyArray<GridPos> = [
  { col: 2, row: 1 }, // tile_0014 — clean brick wall
  { col: 3, row: 1 }, // tile_0015 — brick with right shadow
  { col: 4, row: 3 }, // tile_0040 — alt brick pattern
  { col: 3, row: 2 }, // tile_0027 — heavy-shadow brick
];

// Single archer body tile, recoloured per-skin via Sprite.tint.
// Tile (1, 7) = a knight silhouette with helmet + visible shield.
export const TD_ARCHER_BODY: GridPos = { col: 1, row: 7 };

// Per-theme stone tint (multiplicative). Sacred warm-green, Spires
// cool-blue, Temple deep-purple. These multiply with the Tiny Dungeon
// blue-gray base palette → distinct theme reads.
export const TD_THEME_TINT: Record<ThemeId, number> = {
  "sacred-grove": 0xb5d99c,
  "twin-spires": 0xa6c0d8,
  "old-temple": 0x9c80c8,
};

// Per-skin archer tint. Multiplies with the base knight sprite.
// Onyx is intentionally near-black to read as a shadow-cloaked figure.
export const TD_SKIN_TINT: Record<ArcherSkinId, number> = {
  verdant: 0x66c466, // green
  crimson: 0xff5555, // bright red
  azure: 0x6688ff, // strong blue
  saffron: 0xffd455, // gold/yellow
  onyx: 0x444466, // dark blue-black
  frost: 0xc8e8ff, // ice blue
};

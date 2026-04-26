// Phase 10.5b — Tile builder backed by Kenney's Tiny Dungeon (CC0).
//
// Replaces the SOLID_0..3 variants with sliced + theme-tinted CC0
// tiles. SOLID_4..7, SOLID_FACE, JUMPTHRU, SPIKE keep the procedural
// pipeline (the CC0 pack doesn't have spike traps or wood platforms
// that fit our colour story, and we'd rather mix CC0 stones with our
// own platform/spike art than down-grade those).
//
// Same `TileSpriteKey → HTMLCanvasElement` contract as
// `tile-painter.ts::buildTileSprites` so AssetRegistry stays unchanged.

import type { ThemeId } from "@arrowfall/shared";
import { newCanvas } from "./canvas.js";
import { tdAt, tintTile, type CC0Sheet } from "./cc0-loader.js";
import { TD_SOLID_VARIANTS, TD_THEME_TINT } from "./cc0-mapping.js";
import {
  buildTileSprites as buildTileSpritesProcedural,
  type TileSpriteKey,
} from "./tile-painter.js";

// Returns the same key set as `buildTileSpritesProcedural`. SOLID_0..3
// are CC0 + theme-tint; the rest are the procedural fallbacks.
export const buildTileSpritesCC0 = (
  theme: ThemeId,
  sheet: CC0Sheet,
): Map<TileSpriteKey, HTMLCanvasElement> => {
  const procedural = buildTileSpritesProcedural(theme);
  const out = new Map<TileSpriteKey, HTMLCanvasElement>(procedural);

  const themeTint = TD_THEME_TINT[theme];
  for (let i = 0; i < TD_SOLID_VARIANTS.length; i++) {
    const { col, row } = TD_SOLID_VARIANTS[i]!;
    const src = tdAt(sheet, row, col);
    const tinted = tintTile(src, themeTint);
    // SOLID_0..3 — overwrite the procedural ones with CC0 versions.
    out.set(`SOLID_${i as 0 | 1 | 2 | 3}`, tinted);
  }

  return out;
};

// Re-export so callers can construct EMPTY canvas without depending
// on the procedural module directly.
export const buildEmptyTile = (): HTMLCanvasElement => newCanvas(16, 16);

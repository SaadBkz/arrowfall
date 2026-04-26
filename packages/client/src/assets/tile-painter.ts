// Phase 10 — Tile painter. Generates a 16×16 px image for each
// (theme, kind) pair. The TilemapRenderer caches the textures and
// blits them per cell at bake time.
//
// Each painter respects the visual style contract (docs/visual-style.md
// §3): mid fill → organic edge → directional shade → distinctive
// detail → spec highlight. Variant index drives a small set of
// pre-baked decorations (so players can build mental landmarks).

import type { TileKind, ThemeId } from "@arrowfall/shared";
import { type Painter2D, mulberry32, newCanvas, px, rect, tileSeed } from "./canvas.js";
import { PALETTES, type ThemePalette } from "./palettes.js";

export const TILE_PX = 16;

// Per-theme variant counts. SOLID has 4 variants (any tile picks one
// based on its (tx, ty) seed). Other kinds use 1 variant (they're
// already distinctive enough).
const SOLID_VARIANTS = 4;

export type TileSpriteKey =
  | "EMPTY"
  | `SOLID_${0 | 1 | 2 | 3}`
  | "JUMPTHRU"
  | "SPIKE";

// Choose the variant a tile should use. EMPTY is rendered transparent.
// SPAWN/CHEST_SPAWN are gameplay markers — invisible at render.
export const variantKeyFor = (
  theme: ThemeId,
  kind: TileKind,
  tx: number,
  ty: number,
): TileSpriteKey | null => {
  switch (kind) {
    case "EMPTY":
    case "SPAWN":
    case "CHEST_SPAWN":
      return null;
    case "JUMPTHRU":
      return "JUMPTHRU";
    case "SPIKE":
      return "SPIKE";
    case "SOLID": {
      const seed = tileSeed(theme, tx, ty);
      const v = (seed % SOLID_VARIANTS) as 0 | 1 | 2 | 3;
      return `SOLID_${v}`;
    }
  }
};

// Bake the full set of tile canvases for a theme. Returns a map keyed
// by TileSpriteKey. The TilemapRenderer turns these into Pixi
// textures once and re-uses them.
export const buildTileSprites = (
  theme: ThemeId,
): Map<TileSpriteKey, HTMLCanvasElement> => {
  const palette = PALETTES[theme];
  const out = new Map<TileSpriteKey, HTMLCanvasElement>();

  for (let v = 0; v < SOLID_VARIANTS; v++) {
    out.set(`SOLID_${v as 0 | 1 | 2 | 3}`, paintSolid(theme, palette, v));
  }
  out.set("JUMPTHRU", paintJumpthru(theme, palette));
  out.set("SPIKE", paintSpike(theme, palette));
  return out;
};

const paintSolid = (
  theme: ThemeId,
  p: ThemePalette,
  variant: number,
): HTMLCanvasElement => {
  const c = newCanvas(TILE_PX, TILE_PX);
  const g = c.getContext("2d")!;
  const rng = mulberry32(0xa110_0000 + variant * 7);

  // Layer 0 — body fill.
  rect(g, 0, 0, TILE_PX, TILE_PX, p.stone[1]);

  // Layer 1 — organic top edge: moss / snow / runes drip.
  paintTopEdge(g, theme, p, rng);

  // Layer 2 — directional shading. Top-left light, bottom-right shadow.
  // 1px highlight strip top + left, 1px shadow strip bottom + right.
  rect(g, 0, 0, TILE_PX, 1, p.stone[2]);
  rect(g, 0, 0, 1, TILE_PX, p.stone[2]);
  rect(g, 0, TILE_PX - 1, TILE_PX, 1, p.stone[0]);
  rect(g, TILE_PX - 1, 0, 1, TILE_PX, p.stone[0]);

  // Layer 3 — variant-specific detail. variant 0 = plain, 1 = fissure,
  // 2 = small rune (theme accent), 3 = small bevel + spec highlight.
  if (variant === 1) {
    // Diagonal fissure top-right → mid.
    px(g, 11, 3, p.stone[0]);
    px(g, 10, 4, p.stone[0]);
    px(g, 9, 5, p.stone[0]);
    px(g, 9, 6, p.stone[0]);
    px(g, 10, 7, p.stone[0]);
  } else if (variant === 2) {
    // Tiny rune square 3×3 centered. Theme accent colour.
    rect(g, 6, 7, 4, 3, p.metal[2]);
    px(g, 7, 8, p.metal[1]);
    px(g, 8, 8, p.metal[3]);
  } else if (variant === 3) {
    // Bevel inset: lighter highlight square + dark inset corner.
    rect(g, 4, 4, 3, 3, p.stone[3]);
    px(g, 4, 4, p.stone[2]);
    px(g, 6, 6, p.stone[1]);
  }

  // Layer 4 — single spec pixel near top-left for sparkle, only on
  // ~50% of variants.
  if (variant % 2 === 0) {
    px(g, 2, 2, p.stone[3]);
  }

  return c;
};

// Top edge of SOLID: theme-flavoured organic dressing.
//   sacred-grove → moss tufts (accent ramp)
//   twin-spires  → snow caps (accent ramp)
//   old-temple   → gold rune trim (metal ramp)
const paintTopEdge = (
  g: Painter2D,
  theme: ThemeId,
  p: ThemePalette,
  rng: () => number,
): void => {
  if (theme === "old-temple") {
    // Gold trim line + 2 rune dots.
    rect(g, 0, 1, TILE_PX, 1, p.metal[1]);
    px(g, 4, 2, p.metal[2]);
    px(g, 11, 2, p.metal[2]);
    return;
  }
  // Sacred / Spires: jagged organic top.
  for (let x = 0; x < TILE_PX; x++) {
    const r = rng();
    if (r > 0.4) px(g, x, 1, p.accent[1]);
    if (r > 0.7) px(g, x, 2, p.accent[2]);
    if (r > 0.92) {
      // Tuft / cap pop above the surface.
      px(g, x, 0, p.accent[3]);
    }
  }
};

const paintJumpthru = (theme: ThemeId, p: ThemePalette): HTMLCanvasElement => {
  const c = newCanvas(TILE_PX, TILE_PX);
  const g = c.getContext("2d")!;

  if (theme === "sacred-grove") {
    // Wood plank with iron straps.
    rect(g, 0, 0, TILE_PX, 4, p.wood[1]);
    rect(g, 0, 1, TILE_PX, 1, p.wood[2]);
    rect(g, 0, 3, TILE_PX, 1, p.wood[0]);
    // Wood grain.
    px(g, 3, 2, p.wood[0]);
    px(g, 8, 2, p.wood[0]);
    px(g, 13, 2, p.wood[0]);
    // Iron straps left + right.
    rect(g, 1, 0, 2, 4, p.stone[0]);
    px(g, 2, 1, p.metal[2]);
    rect(g, TILE_PX - 3, 0, 2, 4, p.stone[0]);
    px(g, TILE_PX - 2, 1, p.metal[2]);
  } else if (theme === "twin-spires") {
    // Marble bar with crystal in the middle.
    rect(g, 0, 0, TILE_PX, 4, p.stone[2]);
    rect(g, 0, 1, TILE_PX, 1, p.stone[3]);
    rect(g, 0, 3, TILE_PX, 1, p.stone[0]);
    // Crystal centre — accent (snow ramp light end) + cyan highlight.
    rect(g, 6, 1, 4, 2, p.accent[3]);
    px(g, 7, 1, p.text[3]);
    // Side caps.
    rect(g, 0, 0, 2, 4, p.stone[0]);
    rect(g, TILE_PX - 2, 0, 2, 4, p.stone[0]);
  } else {
    // old-temple — bronze bar with cyan rune.
    rect(g, 0, 0, TILE_PX, 4, p.wood[1]);
    rect(g, 0, 1, TILE_PX, 1, p.wood[2]);
    rect(g, 0, 3, TILE_PX, 1, p.wood[0]);
    // Cyan rune.
    rect(g, 7, 1, 2, 2, p.accent[2]);
    px(g, 7, 1, p.accent[3]);
    // Gold caps.
    rect(g, 0, 0, 2, 4, p.metal[1]);
    rect(g, TILE_PX - 2, 0, 2, 4, p.metal[1]);
  }
  return c;
};

const paintSpike = (theme: ThemeId, p: ThemePalette): HTMLCanvasElement => {
  const c = newCanvas(TILE_PX, TILE_PX);
  const g = c.getContext("2d")!;

  // Base strip — themed.
  const base = theme === "twin-spires" ? p.stone[1] : p.wood[1];
  const baseEdge = theme === "twin-spires" ? p.stone[0] : p.wood[0];
  rect(g, 0, TILE_PX - 4, TILE_PX, 4, base);
  rect(g, 0, TILE_PX - 4, TILE_PX, 1, baseEdge);

  // 4 spikes pointing up. Slight irregularity so they don't read as
  // a monolithic comb — heights 8 / 10 / 7 / 9.
  const heights = [8, 10, 7, 9];
  const tip = theme === "twin-spires" ? p.accent[3] : p.metal[3];
  const shaft = theme === "twin-spires" ? p.stone[2] : p.metal[2];
  const shadow = theme === "twin-spires" ? p.stone[0] : p.metal[0];

  for (let i = 0; i < 4; i++) {
    const baseX = i * 4;
    const h = heights[i]!;
    const startY = TILE_PX - 4 - h;
    // Triangle fill.
    for (let row = 0; row < h; row++) {
      const w = Math.max(1, 4 - Math.floor(row * 4 / h));
      const offset = (4 - w) / 2;
      rect(g, baseX + Math.floor(offset), startY + row, Math.ceil(w), 1, shaft);
    }
    // Tip highlight.
    px(g, baseX + 2, startY, tip);
    // Shadow on right edge.
    px(g, baseX + 3, startY + h - 1, shadow);
  }

  return c;
};

// Phase 10 iter-2 — Tile painter, much richer than iter-1. Each
// theme exposes 8 SOLID variants + a "carved face" variant that
// replaces a small fraction of tiles to break up the algorithmic
// regularity. Chosen variant per cell stays deterministic (tileSeed),
// so player muscle memory holds across reloads.
//
// Pipeline per tile (5 layers):
//   0 — body fill (mid).
//   1 — organic top edge (theme: moss / snow / gold trim).
//   2 — directional shading (top-left highlight, bottom-right shadow).
//   3 — variant detail (fissure / rune / face / vine / etc.).
//   4 — rare specular pixel.
// docs/visual-style.md §3 for the design rationale.

import type { TileKind, ThemeId } from "@arrowfall/shared";
import { type Painter2D, mulberry32, newCanvas, px, rect, tileSeed } from "./canvas.js";
import { PALETTES, type ThemePalette } from "./palettes.js";

export const TILE_PX = 16;

const SOLID_VARIANTS = 8;
// 1 in N SOLID tiles is upgraded to the "carved face" variant —
// makes a couple of TowerFall-style sculpted blocks pop in each map
// without overdoing it.
const FACE_TILE_DENOMINATOR = 11;

export type TileSpriteKey =
  | "EMPTY"
  | `SOLID_${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7}`
  | "SOLID_FACE"
  | "JUMPTHRU"
  | "SPIKE";

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
      // Sculpted faces every ~11 tiles. Only allowed on tiles that
      // aren't decoration-anchored (we let the spawner overlay decos
      // separately — collision is wallpaper-blind so it's safe).
      if (seed % FACE_TILE_DENOMINATOR === 3) return "SOLID_FACE";
      const v = (seed % SOLID_VARIANTS) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
      return `SOLID_${v}`;
    }
  }
};

export const buildTileSprites = (
  theme: ThemeId,
): Map<TileSpriteKey, HTMLCanvasElement> => {
  const palette = PALETTES[theme];
  const out = new Map<TileSpriteKey, HTMLCanvasElement>();
  for (let v = 0; v < SOLID_VARIANTS; v++) {
    out.set(`SOLID_${v as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7}`, paintSolid(theme, palette, v));
  }
  out.set("SOLID_FACE", paintSolidFace(theme, palette));
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

  // Layer 0 — body.
  rect(g, 0, 0, TILE_PX, TILE_PX, p.stone[1]);

  // Sub-block fill — random 4×4 patches of slightly varied tone for
  // texture, instead of a flat color. Keeps the tile from reading flat.
  for (let cy = 0; cy < TILE_PX; cy += 4) {
    for (let cx = 0; cx < TILE_PX; cx += 4) {
      if (rng() > 0.6) {
        rect(g, cx, cy, 4, 4, p.stone[0]);
      } else if (rng() > 0.7) {
        rect(g, cx, cy, 4, 4, p.stone[2]);
      }
    }
  }

  // Layer 1 — organic top edge.
  paintTopEdge(g, theme, p, mulberry32(0xb220_0000 + variant * 13));

  // Layer 2 — directional shading.
  rect(g, 0, 0, TILE_PX, 1, p.stone[2]);
  rect(g, 0, 0, 1, TILE_PX, p.stone[2]);
  rect(g, 0, TILE_PX - 1, TILE_PX, 1, p.stone[0]);
  rect(g, TILE_PX - 1, 0, 1, TILE_PX, p.stone[0]);

  // Layer 3 — variant-specific detail.
  switch (variant) {
    case 0:
      // Plain — small mossy specks at random.
      for (let i = 0; i < 3; i++) {
        const x = 2 + Math.floor(rng() * 12);
        const y = 4 + Math.floor(rng() * 10);
        px(g, x, y, p.accent[0]);
      }
      break;
    case 1: {
      // Diagonal fissure top-right → mid.
      px(g, 11, 3, p.stone[0]);
      px(g, 10, 4, p.stone[0]);
      px(g, 9, 5, p.stone[0]);
      px(g, 9, 6, p.stone[0]);
      px(g, 10, 7, p.stone[0]);
      px(g, 12, 4, p.stone[2]);
      break;
    }
    case 2: {
      // Centered rune square 4×3 with theme accent.
      rect(g, 6, 7, 4, 3, p.metal[2]);
      px(g, 7, 8, p.metal[1]);
      px(g, 8, 8, p.metal[3]);
      px(g, 6, 7, p.metal[0]);
      px(g, 9, 9, p.metal[0]);
      break;
    }
    case 3: {
      // Inset bevel top-left.
      rect(g, 4, 4, 3, 3, p.stone[3]);
      px(g, 4, 4, p.stone[2]);
      px(g, 6, 6, p.stone[1]);
      // Carved corner pixel.
      px(g, 5, 5, p.stone[0]);
      break;
    }
    case 4: {
      // Brick-pattern grout: horizontal mortar stripe + a vertical seam.
      rect(g, 0, 8, TILE_PX, 1, p.stone[0]);
      rect(g, 7, 0, 1, 8, p.stone[0]);
      rect(g, 4, 9, 1, 7, p.stone[0]);
      rect(g, 11, 9, 1, 7, p.stone[0]);
      // Single-pixel highlight on a brick.
      px(g, 2, 2, p.stone[3]);
      px(g, 14, 11, p.stone[3]);
      break;
    }
    case 5: {
      // Mossy patch crawling from the bottom.
      for (let x = 0; x < TILE_PX; x++) {
        if (rng() > 0.5) px(g, x, TILE_PX - 1, p.accent[1]);
        if (rng() > 0.7) px(g, x, TILE_PX - 2, p.accent[0]);
      }
      px(g, 3, 12, p.accent[2]);
      px(g, 9, 13, p.accent[2]);
      break;
    }
    case 6: {
      // Two small carved holes (eyelets).
      rect(g, 4, 5, 2, 2, p.stone[0]);
      rect(g, 10, 5, 2, 2, p.stone[0]);
      px(g, 4, 5, p.stone[3]);
      px(g, 10, 5, p.stone[3]);
      // Connecting carved line.
      rect(g, 5, 9, 6, 1, p.stone[0]);
      break;
    }
    case 7: {
      // Vertical accent stripe (theme color), dim.
      rect(g, 7, 2, 2, TILE_PX - 4, p.metal[0]);
      px(g, 7, 4, p.metal[2]);
      px(g, 8, 8, p.metal[3]);
      px(g, 7, 12, p.metal[2]);
      break;
    }
  }

  // Layer 4 — sparse specular.
  if (variant % 3 === 0) {
    px(g, 2, 2, p.stone[3]);
  }

  return c;
};

// Carved face SOLID — replaces ~9% of regular SOLIDs. Each theme has
// its own face style, much more elaborate than the generic variants.
const paintSolidFace = (
  theme: ThemeId,
  p: ThemePalette,
): HTMLCanvasElement => {
  const c = newCanvas(TILE_PX, TILE_PX);
  const g = c.getContext("2d")!;

  // Base tile.
  rect(g, 0, 0, TILE_PX, TILE_PX, p.stone[1]);
  rect(g, 0, 0, TILE_PX, 1, p.stone[2]);
  rect(g, 0, 0, 1, TILE_PX, p.stone[2]);
  rect(g, 0, TILE_PX - 1, TILE_PX, 1, p.stone[0]);
  rect(g, TILE_PX - 1, 0, 1, TILE_PX, p.stone[0]);

  if (theme === "old-temple") {
    // Mayan god face plate (gold trim + glowing eyes + fangs).
    rect(g, 1, 1, 14, 1, p.metal[1]);
    rect(g, 1, 14, 14, 1, p.metal[1]);
    rect(g, 1, 1, 1, 14, p.metal[1]);
    rect(g, 14, 1, 1, 14, p.metal[1]);
    rect(g, 2, 2, 12, 12, p.stone[0]);
    rect(g, 4, 5, 3, 2, p.fire[2]);
    rect(g, 9, 5, 3, 2, p.fire[2]);
    px(g, 5, 5, p.fire[3]);
    px(g, 10, 5, p.fire[3]);
    rect(g, 7, 7, 2, 3, p.metal[1]);
    rect(g, 4, 10, 8, 1, p.stone[2]);
    px(g, 5, 11, p.text[3]);
    px(g, 7, 11, p.text[3]);
    px(g, 9, 11, p.text[3]);
    px(g, 11, 11, p.text[3]);
    px(g, 7, 3, p.accent[2]);
    px(g, 8, 3, p.accent[2]);
    return c;
  }

  if (theme === "twin-spires") {
    // Frosted face — closed eyes weeping glacial drips.
    rect(g, 0, 0, TILE_PX, 2, p.accent[3]);
    rect(g, 0, 2, TILE_PX, 1, p.accent[2]);
    rect(g, 4, 4, 8, 8, p.stone[0]);
    rect(g, 5, 5, 6, 6, p.stone[2]);
    rect(g, 5, 7, 2, 1, p.accent[3]);
    rect(g, 9, 7, 2, 1, p.accent[3]);
    px(g, 6, 8, p.accent[2]);
    px(g, 10, 8, p.accent[2]);
    px(g, 7, 8, p.stone[1]);
    px(g, 8, 8, p.stone[1]);
    rect(g, 6, 10, 4, 1, p.stone[0]);
    px(g, 7, 13, p.accent[2]);
    px(g, 9, 14, p.accent[2]);
    return c;
  }

  // Sacred Grove — calm cherub face overgrown with vines.
  rect(g, 4, 4, 8, 8, p.stone[2]);
  rect(g, 5, 3, 6, 1, p.stone[3]);
  rect(g, 5, 12, 6, 1, p.stone[0]);
  rect(g, 5, 7, 2, 1, p.metal[2]);
  rect(g, 9, 7, 2, 1, p.metal[2]);
  rect(g, 7, 10, 2, 1, p.stone[0]);
  // Vines.
  px(g, 1, 5, p.accent[1]);
  px(g, 2, 4, p.accent[1]);
  px(g, 3, 5, p.accent[2]);
  px(g, 14, 11, p.accent[1]);
  px(g, 13, 10, p.accent[2]);
  px(g, 12, 12, p.accent[2]);
  // Leaf tufts.
  px(g, 1, 4, p.accent[3]);
  px(g, 14, 10, p.accent[3]);
  return c;
};

const paintTopEdge = (
  g: Painter2D,
  theme: ThemeId,
  p: ThemePalette,
  rng: () => number,
): void => {
  if (theme === "old-temple") {
    rect(g, 0, 1, TILE_PX, 1, p.metal[1]);
    px(g, 4, 2, p.metal[2]);
    px(g, 11, 2, p.metal[2]);
    rect(g, 1, 0, 1, 1, p.metal[3]);
    rect(g, 14, 0, 1, 1, p.metal[3]);
    return;
  }
  for (let x = 0; x < TILE_PX; x++) {
    const r = rng();
    if (r > 0.4) px(g, x, 1, p.accent[1]);
    if (r > 0.7) px(g, x, 2, p.accent[2]);
    if (r > 0.92) px(g, x, 0, p.accent[3]);
  }
};

const paintJumpthru = (theme: ThemeId, p: ThemePalette): HTMLCanvasElement => {
  const c = newCanvas(TILE_PX, TILE_PX);
  const g = c.getContext("2d")!;
  if (theme === "sacred-grove") {
    rect(g, 0, 0, TILE_PX, 5, p.wood[1]);
    rect(g, 0, 1, TILE_PX, 1, p.wood[2]);
    rect(g, 0, 4, TILE_PX, 1, p.wood[0]);
    px(g, 3, 2, p.wood[0]);
    px(g, 8, 2, p.wood[0]);
    px(g, 13, 2, p.wood[0]);
    px(g, 5, 3, p.wood[0]);
    px(g, 11, 3, p.wood[0]);
    rect(g, 1, 0, 2, 5, p.stone[0]);
    px(g, 2, 1, p.metal[2]);
    px(g, 2, 3, p.metal[2]);
    rect(g, TILE_PX - 3, 0, 2, 5, p.stone[0]);
    px(g, TILE_PX - 2, 1, p.metal[2]);
    px(g, TILE_PX - 2, 3, p.metal[2]);
    // Moss skirt under the plank.
    px(g, 4, 5, p.accent[1]);
    px(g, 9, 5, p.accent[1]);
    px(g, 12, 5, p.accent[2]);
  } else if (theme === "twin-spires") {
    rect(g, 0, 0, TILE_PX, 5, p.stone[2]);
    rect(g, 0, 1, TILE_PX, 1, p.stone[3]);
    rect(g, 0, 4, TILE_PX, 1, p.stone[0]);
    rect(g, 6, 1, 4, 2, p.accent[3]);
    px(g, 7, 1, p.text[3]);
    px(g, 8, 2, p.accent[2]);
    rect(g, 0, 0, 2, 5, p.stone[0]);
    rect(g, TILE_PX - 2, 0, 2, 5, p.stone[0]);
    // Snow cap on top.
    rect(g, 0, 0, TILE_PX, 1, p.accent[3]);
    px(g, 3, 0, p.text[3]);
    px(g, 9, 0, p.text[3]);
    // Tiny icicles under.
    px(g, 4, 5, p.accent[3]);
    px(g, 11, 5, p.accent[2]);
  } else {
    // Old Temple — bronze bar with cyan rune + gold trim.
    rect(g, 0, 0, TILE_PX, 5, p.wood[1]);
    rect(g, 0, 1, TILE_PX, 1, p.wood[2]);
    rect(g, 0, 4, TILE_PX, 1, p.wood[0]);
    rect(g, 7, 1, 2, 3, p.accent[2]);
    px(g, 7, 1, p.accent[3]);
    px(g, 8, 2, p.accent[3]);
    rect(g, 0, 0, 2, 5, p.metal[1]);
    rect(g, TILE_PX - 2, 0, 2, 5, p.metal[1]);
    // Glyph trim on the bar.
    px(g, 4, 2, p.metal[2]);
    px(g, 11, 2, p.metal[2]);
    px(g, 4, 5, p.metal[1]);
    px(g, 11, 5, p.metal[1]);
  }
  return c;
};

const paintSpike = (theme: ThemeId, p: ThemePalette): HTMLCanvasElement => {
  const c = newCanvas(TILE_PX, TILE_PX);
  const g = c.getContext("2d")!;
  const base = theme === "twin-spires" ? p.stone[1] : p.wood[1];
  const baseEdge = theme === "twin-spires" ? p.stone[0] : p.wood[0];
  rect(g, 0, TILE_PX - 4, TILE_PX, 4, base);
  rect(g, 0, TILE_PX - 4, TILE_PX, 1, baseEdge);
  // 4 irregular spikes.
  const heights = [9, 12, 8, 10];
  const tip = theme === "twin-spires" ? p.accent[3] : p.metal[3];
  const shaft = theme === "twin-spires" ? p.stone[2] : p.metal[2];
  const shadow = theme === "twin-spires" ? p.stone[0] : p.metal[0];
  for (let i = 0; i < 4; i++) {
    const baseX = i * 4;
    const h = heights[i]!;
    const startY = TILE_PX - 4 - h;
    for (let row = 0; row < h; row++) {
      const w = Math.max(1, 4 - Math.floor((row * 4) / h));
      const offset = (4 - w) / 2;
      rect(g, baseX + Math.floor(offset), startY + row, Math.ceil(w), 1, shaft);
    }
    px(g, baseX + 2, startY, tip);
    px(g, baseX + 3, startY + h - 1, shadow);
  }
  // Blood splatter / rust at the base.
  if (theme === "old-temple") {
    px(g, 1, TILE_PX - 1, p.fire[1]);
    px(g, 14, TILE_PX - 1, p.fire[1]);
  } else {
    px(g, 2, TILE_PX - 1, p.fire[2]);
    px(g, 13, TILE_PX - 1, p.fire[2]);
  }
  return c;
};

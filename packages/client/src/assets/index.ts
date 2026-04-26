// Phase 10 — Asset registry. Builds every sprite at boot, wraps each
// canvas in a Pixi Texture, and hands the Game a single immutable
// registry it can pass to renderers. ~280 textures total — built in
// ~150 ms cold on a mid-range laptop, see docs/visual-style.md §9.
//
// VITE_NO_SPRITES=1 — main.ts skips buildAllAssets() and constructs
// renderers in legacy/Phase-4 mode (rectangles). This module never
// has to know about that toggle.

import { Texture } from "pixi.js";
import type { ThemeId } from "@arrowfall/shared";
import { ALL_THEMES } from "@arrowfall/shared";
import {
  buildArcherSprites,
  type ArcherSpriteKey,
} from "./archer-painter.js";
import {
  buildArrowSprites,
  type ArrowSpriteKey,
} from "./arrow-painter.js";
import {
  buildBackgroundSprites,
  type BackgroundSpriteKey,
} from "./background-painter.js";
import {
  buildChestSprites,
  type ChestSpriteKey,
} from "./chest-painter.js";
import {
  buildDecorationSprites,
  type DecorationSpriteKey,
} from "./decoration-painter.js";
import {
  buildFogSprites,
  type FogSpriteKey,
} from "./fog-painter.js";
import {
  buildFrameSprites,
  type FrameSpriteKey,
} from "./frame-painter.js";
import {
  buildShieldSprites,
  type ShieldSpriteKey,
} from "./shield-painter.js";
import {
  buildTileSprites,
  type TileSpriteKey,
} from "./tile-painter.js";
import { buildVignette } from "./vignette-painter.js";
import { ALL_ARCHER_SKINS, type ArcherSkinId } from "./palettes.js";

export type AssetRegistry = {
  readonly tiles: ReadonlyMap<ThemeId, ReadonlyMap<TileSpriteKey, Texture>>;
  readonly archers: ReadonlyMap<
    ArcherSkinId,
    ReadonlyMap<ArcherSpriteKey, Texture>
  >;
  readonly arrows: ReadonlyMap<ArrowSpriteKey, Texture>;
  readonly chests: ReadonlyMap<ChestSpriteKey, Texture>;
  readonly shields: ReadonlyMap<ShieldSpriteKey, Texture>;
  readonly backgrounds: ReadonlyMap<BackgroundSpriteKey, Texture>;
  readonly decorations: ReadonlyMap<
    ThemeId,
    ReadonlyMap<DecorationSpriteKey, Texture>
  >;
  // Phase 10.5.a — frame panels (32×270 left/right per theme), fog
  // overlay (256×270 tileable per theme), and a single vignette texture
  // (480×270 RGBA radial alpha).
  readonly frames: ReadonlyMap<ThemeId, ReadonlyMap<FrameSpriteKey, Texture>>;
  readonly fog: ReadonlyMap<FogSpriteKey, Texture>;
  readonly vignette: Texture;
};

const toTextureMap = <K>(
  canvases: ReadonlyMap<K, HTMLCanvasElement>,
): Map<K, Texture> => {
  const out = new Map<K, Texture>();
  for (const [key, canvas] of canvases) {
    // Texture.from accepts an HTMLCanvasElement directly in Pixi v8.
    out.set(key, Texture.from(canvas));
  }
  return out;
};

export const buildAllAssets = (): AssetRegistry => {
  const tiles = new Map<ThemeId, Map<TileSpriteKey, Texture>>();
  const backgrounds = new Map<BackgroundSpriteKey, Texture>();
  const decorations = new Map<ThemeId, Map<DecorationSpriteKey, Texture>>();
  const frames = new Map<ThemeId, Map<FrameSpriteKey, Texture>>();
  const fog = new Map<FogSpriteKey, Texture>();
  for (const theme of ALL_THEMES) {
    tiles.set(theme, toTextureMap(buildTileSprites(theme)));
    decorations.set(theme, toTextureMap(buildDecorationSprites(theme)));
    frames.set(theme, toTextureMap(buildFrameSprites(theme)));
    for (const [k, v] of toTextureMap(buildBackgroundSprites(theme))) {
      backgrounds.set(k, v);
    }
    for (const [k, v] of toTextureMap(buildFogSprites(theme))) {
      fog.set(k, v);
    }
  }

  const archers = new Map<ArcherSkinId, Map<ArcherSpriteKey, Texture>>();
  for (const skin of ALL_ARCHER_SKINS) {
    archers.set(skin, toTextureMap(buildArcherSprites(skin)));
  }

  const arrows = toTextureMap(buildArrowSprites());
  const chests = toTextureMap(buildChestSprites());
  const shields = toTextureMap(buildShieldSprites());
  const vignette = Texture.from(buildVignette());

  return {
    tiles,
    archers,
    arrows,
    chests,
    shields,
    backgrounds,
    decorations,
    frames,
    fog,
    vignette,
  };
};

// Re-exports so renderers can import painter constants and types
// without reaching into the painter modules directly.
export { ALL_ARCHER_SKINS, ARCHER_SKINS } from "./palettes.js";
export type { ArcherSkinId, ArcherPalette, ThemePalette, Ramp } from "./palettes.js";
export {
  ARCHER_SPRITE_OX,
  ARCHER_SPRITE_OY,
  ARCHER_SPRITE_SIZE,
  AIM_DIRS,
  aimDirOf,
} from "./archer-painter.js";
export type { ArcherSpriteKey, AimDir } from "./archer-painter.js";
export {
  ARROW_SPRITE_OX,
  ARROW_SPRITE_OY,
  ARROW_SPRITE_W,
  ARROW_SPRITE_H,
  flyingFrameFor,
} from "./arrow-painter.js";
export type { ArrowSpriteKey } from "./arrow-painter.js";
export {
  CHEST_SPRITE_W,
  CHEST_SPRITE_H,
  CHEST_FRAME_COUNT,
  chestFrameFor,
} from "./chest-painter.js";
export type { ChestSpriteKey } from "./chest-painter.js";
export {
  SHIELD_SPRITE_SIZE,
  SHIELD_FRAME_COUNT,
} from "./shield-painter.js";
export type { ShieldSpriteKey } from "./shield-painter.js";
export {
  BG_W,
  BG_H,
} from "./background-painter.js";
export type { BackgroundSpriteKey, BackgroundLayer } from "./background-painter.js";
export {
  TILE_PX,
  variantKeyFor,
} from "./tile-painter.js";
export type { TileSpriteKey } from "./tile-painter.js";
export { PALETTES } from "./palettes.js";
export type { DecorationKind, DecorationSpriteKey } from "./decoration-painter.js";
export { spawnDecorations } from "./decoration-spawner.js";
export type { Decoration } from "./decoration-spawner.js";
export {
  FRAME_PANEL_W,
  FRAME_PANEL_H,
} from "./frame-painter.js";
export type { FrameSide, FrameSpriteKey } from "./frame-painter.js";
export {
  VIGNETTE_W,
  VIGNETTE_H,
  VIGNETTE_MAX_ALPHA,
  vignetteAlphaAt,
} from "./vignette-painter.js";
export {
  FOG_W,
  FOG_H,
  fogValueAt,
} from "./fog-painter.js";
export type { FogSpriteKey } from "./fog-painter.js";

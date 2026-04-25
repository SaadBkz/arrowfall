// Phase 4 palette. Pure 32-bit RGB integers (no alpha) for PixiJS Graphics.
// Phase 10 will replace these with pixel-art assets.

import type { TileKind } from "@arrowfall/shared";

export const BG_COLOR = 0x1a1a2e;

export const TILE_COLORS: Readonly<Record<TileKind, number>> = {
  EMPTY: 0x000000,
  SOLID: 0x444444,
  JUMPTHRU: 0x8b6f47,
  SPIKE: 0xa04030,
  SPAWN: 0x000000,
  CHEST_SPAWN: 0x000000,
};

// Mapping by archer id slot. createWorld inserts archers in alphabetical
// order, so p1 < p2 < … < p6 → slots 0..5. Phase 5 will hot-seat 2-4
// players; the extra slots are pre-allocated.
export const ARCHER_BODY_COLORS: ReadonlyArray<number> = [
  0xdd4444, 0x4488ff, 0x44cc66, 0xeecc44, 0x222222, 0xccffff,
];

export const ARROW_FLYING_COLOR = 0xffffff;
export const ARROW_GROUNDED_COLOR = 0x888888;

export const HUD_TEXT_COLOR = 0xffffff;

export const archerColorFor = (id: string, fallbackIndex: number): number => {
  const m = /^p(\d+)$/.exec(id);
  const slot = m && m[1] !== undefined ? parseInt(m[1], 10) - 1 : fallbackIndex;
  const safe =
    ((slot % ARCHER_BODY_COLORS.length) + ARCHER_BODY_COLORS.length) % ARCHER_BODY_COLORS.length;
  return ARCHER_BODY_COLORS[safe]!;
};

// Lighten an RGB int towards white by `factor` (0..1). Used for the head
// fill so the stompable hitbox visibly stands out from the body.
export const lighten = (hex: number, factor: number): number => {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const lr = Math.min(255, Math.round(r + (255 - r) * factor));
  const lg = Math.min(255, Math.round(g + (255 - g) * factor));
  const lb = Math.min(255, Math.round(b + (255 - b) * factor));
  return (lr << 16) | (lg << 8) | lb;
};

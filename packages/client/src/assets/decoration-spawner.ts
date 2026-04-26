// Phase 10 iter-2 — Decoration spawner. Analyses a parsed map and
// returns a deterministic list of non-grid decorations placed at
// pixel-precise positions: torches above platforms, banners/chains
// hanging under ceilings, idols in the corners, mushrooms / crystals
// scattered along the floor.
//
// Determinism: variant choice goes through a seeded PRNG so the same
// map produces the same decoration layout every load — players build
// muscle memory of where the big idol is, etc.

import type { MapData, ThemeId, Vec2 } from "@arrowfall/shared";
import { TILE_SIZE } from "@arrowfall/shared";
import { mulberry32 } from "./canvas.js";
import type { DecorationKind } from "./decoration-painter.js";

export type Decoration = {
  readonly kind: DecorationKind;
  readonly pos: Vec2; // top-left in logical px
  readonly behindTilemap?: boolean; // if true, drawn under the tilemap
};

// Sample every Nth top-of-platform position (so platforms aren't
// solid-torch lined). 3-4 tiles between torches reads as TowerFall.
const TORCH_SPACING = 3;
const CHAIN_SPACING = 4;

export const spawnDecorations = (map: MapData): ReadonlyArray<Decoration> => {
  const out: Decoration[] = [];
  const rng = mulberry32(seedForMap(map));
  const isSolid = (tx: number, ty: number): boolean => {
    if (ty < 0 || ty >= map.height) return false;
    const wrappedX = ((tx % map.width) + map.width) % map.width;
    return map.tiles[ty]?.[wrappedX] === "SOLID";
  };
  const isEmpty = (tx: number, ty: number): boolean => {
    if (ty < 0 || ty >= map.height) return true;
    const wrappedX = ((tx % map.width) + map.width) % map.width;
    const k = map.tiles[ty]?.[wrappedX];
    return k === "EMPTY" || k === "SPAWN" || k === "CHEST_SPAWN";
  };
  const isJumpthru = (tx: number, ty: number): boolean => {
    if (ty < 0 || ty >= map.height) return false;
    const wrappedX = ((tx % map.width) + map.width) % map.width;
    return map.tiles[ty]?.[wrappedX] === "JUMPTHRU";
  };

  // Layer 1 — top of every SOLID platform run: torch / crystal / mushroom.
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (!isSolid(tx, ty)) continue;
      if (!isEmpty(tx, ty - 1)) continue;
      // This is a top-of-platform tile. Sample.
      if (tx % TORCH_SPACING !== Math.floor(rng() * TORCH_SPACING)) continue;
      const r = rng();
      const ornament = pickTopOrnament(map.theme, r);
      if (ornament === null) continue;
      out.push({
        kind: ornament.kind,
        pos: {
          x: tx * TILE_SIZE + ornament.dx,
          y: ty * TILE_SIZE + ornament.dy,
        },
      });
    }
  }

  // Layer 2 — under SOLID ceilings (SOLID with EMPTY below): banner /
  // chain / vine / icicle pendant from the bottom of the SOLID strip.
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      if (!isSolid(tx, ty)) continue;
      if (!isEmpty(tx, ty + 1)) continue;
      // Skip if it's a thin floor (would clip into a platform below);
      // require at least 3 EMPTY rows below before placing a hanging.
      if (!isEmpty(tx, ty + 2) || !isEmpty(tx, ty + 3)) continue;
      if (tx % CHAIN_SPACING !== Math.floor(rng() * CHAIN_SPACING)) continue;
      const ornament = pickHangingOrnament(map.theme, rng());
      if (ornament === null) continue;
      out.push({
        kind: ornament.kind,
        pos: {
          x: tx * TILE_SIZE + ornament.dx,
          y: ty * TILE_SIZE + TILE_SIZE,
        },
      });
    }
  }

  // Layer 3 — JUMPTHRU enrichment: gold trim under the platform on
  // Old Temple, snow caps on Twin Spires (handled in tile painter),
  // moss skirts on Sacred Grove (handled in tile painter).
  if (map.theme === "old-temple") {
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        if (!isJumpthru(tx, ty)) continue;
        // Only place a panel if neighbour is also a jumpthru (avoid
        // tiny 1-tile platforms looking over-decorated).
        if (!isJumpthru(tx + 1, ty) && !isJumpthru(tx - 1, ty)) continue;
        if (tx % 4 !== 0) continue;
        out.push({
          kind: "ot_gold_panel",
          pos: { x: tx * TILE_SIZE, y: ty * TILE_SIZE + 4 },
        });
      }
    }
  }

  // Layer 4 — corners / centres: a single huge idol if there's room.
  // We hunt for a 3×4 (theme=ot 4×6) clear empty area near the bottom
  // corners of the map. The idol is anchored at its base centre.
  placeIdols(map, out, rng);

  // Layer 5 — sigils floating in the void (Old Temple background).
  if (map.theme === "old-temple") {
    for (let i = 0; i < 8; i++) {
      const tx = Math.floor(rng() * map.width);
      const ty = 1 + Math.floor(rng() * (map.height - 5));
      if (!isEmpty(tx, ty)) continue;
      out.push({
        kind: "ot_sigil",
        pos: { x: tx * TILE_SIZE + 4, y: ty * TILE_SIZE + 4 },
        behindTilemap: true,
      });
    }
  }

  return out;
};

const seedForMap = (map: MapData): number => {
  let h = 0x811c9dc5;
  for (const c of map.id) {
    h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  }
  return h >>> 0;
};

// Pick a top-of-platform ornament for a theme, given a 0..1 roll.
// dx/dy are pixel offsets from the SOLID tile top-left. Heights vary
// so the spawner can position so the deco's base sits on the platform.
const pickTopOrnament = (
  theme: ThemeId,
  roll: number,
):
  | {
      readonly kind: DecorationKind;
      readonly dx: number;
      readonly dy: number;
    }
  | null => {
  switch (theme) {
    case "sacred-grove":
      if (roll < 0.45) return { kind: "sg_torch", dx: 5, dy: -14 };
      if (roll < 0.7) return { kind: "sg_mushroom", dx: 4, dy: -8 };
      if (roll < 0.85) return { kind: "sg_branch", dx: -2, dy: -8 };
      return null;
    case "twin-spires":
      if (roll < 0.5) return { kind: "ts_lantern", dx: 5, dy: -10 };
      if (roll < 0.8) return { kind: "ts_crystal", dx: 5, dy: -8 };
      return null;
    case "old-temple":
      if (roll < 0.6) return { kind: "ot_torch", dx: 4, dy: -16 };
      if (roll < 0.85) return { kind: "ot_sigil", dx: 4, dy: -10 };
      return null;
  }
};

const pickHangingOrnament = (
  theme: ThemeId,
  roll: number,
):
  | {
      readonly kind: DecorationKind;
      readonly dx: number;
    }
  | null => {
  switch (theme) {
    case "sacred-grove":
      if (roll < 0.55) return { kind: "sg_vines_long", dx: 4 };
      if (roll < 0.8) return { kind: "sg_vines_short", dx: 4 };
      return null;
    case "twin-spires":
      if (roll < 0.45) return { kind: "ts_icicle_large", dx: 6 };
      if (roll < 0.75) return { kind: "ts_icicle_small", dx: 6 };
      if (roll < 0.95) return { kind: "ts_banner_red", dx: 4 };
      return null;
    case "old-temple":
      if (roll < 0.45) return { kind: "ot_chain_long", dx: 6 };
      if (roll < 0.75) return { kind: "ot_chain_short", dx: 6 };
      if (roll < 0.9) return { kind: "ot_sigil", dx: 4 };
      return null;
  }
};

// Place 1-2 large idols in the lower corners if there's a clear empty
// vertical strip 4×4 (or larger). Idols are huge and behind tilemap so
// they read as ambient set dressing rather than gameplay obstacles.
const placeIdols = (
  map: MapData,
  out: Decoration[],
  rng: () => number,
): void => {
  const idolKind: DecorationKind =
    map.theme === "sacred-grove"
      ? "sg_idol"
      : map.theme === "twin-spires"
        ? "ts_idol"
        : "ot_idol";
  const idolHeight = map.theme === "old-temple" ? 56 : 40;
  const idolWidth = map.theme === "old-temple" ? 32 : 24;

  const candidates: Array<{ x: number; y: number }> = [];
  // Look for a clear (idolWidth/16 × idolHeight/16 + 1) tiles area at
  // any X, with the bottom row sitting on a SOLID/floor.
  const reqW = Math.ceil(idolWidth / TILE_SIZE);
  const reqH = Math.ceil(idolHeight / TILE_SIZE);
  for (let ty = map.height - reqH - 1; ty > 1; ty--) {
    for (let tx = 1; tx < map.width - reqW - 1; tx++) {
      let ok = true;
      for (let dy = 0; dy < reqH && ok; dy++) {
        for (let dx = 0; dx < reqW && ok; dx++) {
          const k = map.tiles[ty + dy]?.[tx + dx];
          if (k !== "EMPTY" && k !== "SPAWN" && k !== "CHEST_SPAWN") {
            ok = false;
          }
        }
      }
      if (!ok) continue;
      // Need a SOLID floor under the bottom-left and bottom-right of
      // the would-be idol to read as "standing on something".
      const floorY = ty + reqH;
      if (
        map.tiles[floorY]?.[tx] !== "SOLID" ||
        map.tiles[floorY]?.[tx + reqW - 1] !== "SOLID"
      ) {
        continue;
      }
      candidates.push({ x: tx, y: ty });
    }
  }
  // Cap to 2 idols, prefer ones nearest the corners.
  candidates.sort((a, b) => {
    const aScore = Math.min(a.x, map.width - a.x - reqW);
    const bScore = Math.min(b.x, map.width - b.x - reqW);
    return aScore - bScore;
  });
  const toPlace = candidates.slice(0, 2);
  for (const c of toPlace) {
    out.push({
      kind: idolKind,
      pos: {
        x: c.x * TILE_SIZE + (reqW * TILE_SIZE - idolWidth) / 2,
        y: c.y * TILE_SIZE + reqH * TILE_SIZE - idolHeight,
      },
      behindTilemap: true,
    });
  }
  // Fall back if no candidates: anchor a single idol against the
  // bottom-left corner so the level still feels filled.
  if (toPlace.length === 0) {
    out.push({
      kind: idolKind,
      pos: { x: 8, y: (map.height - 1) * TILE_SIZE - idolHeight },
      behindTilemap: true,
    });
  }
  void rng;
};

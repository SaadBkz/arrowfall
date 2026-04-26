import { type Vec2 } from "../math/vec2.js";

export type TileKind = "EMPTY" | "SOLID" | "JUMPTHRU" | "SPIKE" | "SPAWN" | "CHEST_SPAWN";

// Phase 10 — visual themes. The engine doesn't care about themes (they
// drive rendering only), but they live in shared so both client and
// server can carry them in MapData/MapJson without circular deps.
export type ThemeId = "sacred-grove" | "twin-spires" | "old-temple";

export const DEFAULT_THEME: ThemeId = "sacred-grove";

export const ALL_THEMES: ReadonlyArray<ThemeId> = [
  "sacred-grove",
  "twin-spires",
  "old-temple",
];

// ASCII char ↔ TileKind mapping for the .json fixture format.
// Bijective — round-trip parseMap/serializeMap depends on it.
export const TILE_CHAR_TO_KIND: Readonly<Record<string, TileKind>> = {
  ".": "EMPTY",
  "#": "SOLID",
  "-": "JUMPTHRU",
  "^": "SPIKE",
  P: "SPAWN",
  C: "CHEST_SPAWN",
};

export const TILE_KIND_TO_CHAR: Readonly<Record<TileKind, string>> = {
  EMPTY: ".",
  SOLID: "#",
  JUMPTHRU: "-",
  SPIKE: "^",
  SPAWN: "P",
  CHEST_SPAWN: "C",
};

// Runtime data after parsing. `tiles[y][x]` indexed (row-major). spawns/chestSpawns
// are derived convenience lists in *tile* coordinates (not pixels).
export type MapData = {
  readonly id: string;
  readonly name: string;
  readonly width: 30;
  readonly height: 17;
  readonly tiles: ReadonlyArray<ReadonlyArray<TileKind>>;
  readonly spawns: ReadonlyArray<Vec2>;
  readonly chestSpawns: ReadonlyArray<Vec2>;
  // Phase 10 — drives client-side tilesheet/background selection. Pure
  // cosmetic; the engine ignores it. Defaulted to DEFAULT_THEME when
  // a JSON file omits it (back-compat with arena-01/02 fixtures).
  readonly theme: ThemeId;
};

// On-disk shape (.json fixture). `rows` is an array of `height` strings, each of
// length `width`, using the chars from TILE_CHAR_TO_KIND. spawns/chestSpawns are
// derived from the grid and not stored here — keeps the format DRY.
export type MapJson = {
  readonly id: string;
  readonly name: string;
  readonly width: 30;
  readonly height: 17;
  readonly rows: ReadonlyArray<string>;
  // Optional in the JSON to keep arena-01/02 readable; defaults to
  // DEFAULT_THEME at parse time.
  readonly theme?: ThemeId;
};

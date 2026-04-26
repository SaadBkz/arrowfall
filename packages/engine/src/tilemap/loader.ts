import {
  ALL_THEMES,
  ARENA_HEIGHT_TILES,
  ARENA_WIDTH_TILES,
  DEFAULT_THEME,
  TILE_CHAR_TO_KIND,
  TILE_KIND_TO_CHAR,
  type MapData,
  type MapJson,
  type TileKind,
  type Vec2,
} from "@arrowfall/shared";

export class MapParseError extends Error {
  constructor(message: string) {
    super(`MapParseError: ${message}`);
    this.name = "MapParseError";
  }
}

export const parseMap = (json: MapJson): MapData => {
  if (json.width !== ARENA_WIDTH_TILES) {
    throw new MapParseError(`width must be ${ARENA_WIDTH_TILES}, got ${json.width}`);
  }
  if (json.height !== ARENA_HEIGHT_TILES) {
    throw new MapParseError(`height must be ${ARENA_HEIGHT_TILES}, got ${json.height}`);
  }
  if (json.rows.length !== json.height) {
    throw new MapParseError(
      `rows.length must equal height (${json.height}), got ${json.rows.length}`,
    );
  }

  const tiles: TileKind[][] = [];
  const spawns: Vec2[] = [];
  const chestSpawns: Vec2[] = [];

  for (let y = 0; y < json.rows.length; y++) {
    const row = json.rows[y];
    if (row === undefined) {
      throw new MapParseError(`row ${y}: missing`);
    }
    if (row.length !== json.width) {
      throw new MapParseError(`row ${y}: expected ${json.width} chars, got ${row.length}`);
    }
    const tilesRow: TileKind[] = [];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === undefined) {
        throw new MapParseError(`row ${y}, col ${x}: missing char`);
      }
      const kind = TILE_CHAR_TO_KIND[ch];
      if (kind === undefined) {
        throw new MapParseError(`row ${y}, col ${x}: unknown tile char "${ch}"`);
      }
      tilesRow.push(kind);
      if (kind === "SPAWN") spawns.push({ x, y });
      else if (kind === "CHEST_SPAWN") chestSpawns.push({ x, y });
    }
    tiles.push(tilesRow);
  }

  // Phase 10 — theme defaults to DEFAULT_THEME for back-compat with
  // arena-01/02 fixtures that pre-date the field. Validate against
  // ALL_THEMES so a typo in a hand-edited JSON fails fast.
  const theme = json.theme ?? DEFAULT_THEME;
  if (!ALL_THEMES.includes(theme)) {
    throw new MapParseError(
      `theme "${theme}": expected one of ${ALL_THEMES.join(", ")}`,
    );
  }

  return {
    id: json.id,
    name: json.name,
    width: ARENA_WIDTH_TILES,
    height: ARENA_HEIGHT_TILES,
    tiles,
    spawns,
    chestSpawns,
    theme,
  };
};

export const serializeMap = (map: MapData): MapJson => {
  const rows: string[] = [];
  for (let y = 0; y < map.tiles.length; y++) {
    const row = map.tiles[y];
    if (row === undefined) {
      throw new Error(`serializeMap: missing row ${y}`);
    }
    let s = "";
    for (let x = 0; x < row.length; x++) {
      const kind = row[x];
      if (kind === undefined) {
        throw new Error(`serializeMap: missing cell at ${x},${y}`);
      }
      s += TILE_KIND_TO_CHAR[kind];
    }
    rows.push(s);
  }
  // Only emit `theme` if it diverges from the default — keeps the
  // existing arena-01/02 round-trip identical to their pre-Phase-10
  // shape on disk.
  const out: MapJson = {
    id: map.id,
    name: map.name,
    width: map.width,
    height: map.height,
    rows,
    ...(map.theme !== DEFAULT_THEME ? { theme: map.theme } : {}),
  };
  return out;
};

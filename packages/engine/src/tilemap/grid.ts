import {
  ARENA_HEIGHT_PX,
  ARENA_WIDTH_PX,
  TILE_SIZE,
  type MapData,
  type TileKind,
  type Vec2,
} from "@arrowfall/shared";

// True modulo (handles negatives). JS `%` follows the dividend's sign, which
// breaks wrap math for `-1 mod 30` (we want 29, not -1).
const mod = (n: number, m: number): number => ((n % m) + m) % m;

export const tileAt = (map: MapData, tx: number, ty: number): TileKind => {
  const wx = mod(Math.trunc(tx), map.width);
  const wy = mod(Math.trunc(ty), map.height);
  const row = map.tiles[wy];
  if (row === undefined) {
    throw new Error(`tilemap row out of range after wrap: ${wy}`);
  }
  const cell = row[wx];
  if (cell === undefined) {
    throw new Error(`tilemap cell out of range after wrap: ${wx},${wy}`);
  }
  return cell;
};

export const worldToTile = (px: number, py: number): Vec2 => ({
  x: Math.floor(px / TILE_SIZE),
  y: Math.floor(py / TILE_SIZE),
});

// Returns the *centre* of the tile in world pixels.
export const tileToWorld = (tx: number, ty: number): Vec2 => ({
  x: tx * TILE_SIZE + TILE_SIZE / 2,
  y: ty * TILE_SIZE + TILE_SIZE / 2,
});

// Spec §5.2 — continuous wrap on both axes at the logical framebuffer size.
export const wrapPosition = (p: Vec2): Vec2 => ({
  x: mod(p.x, ARENA_WIDTH_PX),
  y: mod(p.y, ARENA_HEIGHT_PX),
});

export const isSolid = (kind: TileKind): boolean => kind === "SOLID";
export const isJumpthru = (kind: TileKind): boolean => kind === "JUMPTHRU";
export const isLethal = (kind: TileKind): boolean => kind === "SPIKE";

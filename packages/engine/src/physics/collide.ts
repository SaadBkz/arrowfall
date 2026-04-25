import {
  type AABB,
  type MapData,
  TILE_SIZE,
} from "@arrowfall/shared";
import { isJumpthru, isSolid, tileAt } from "../tilemap/grid.js";

// Spec §2.6 — archer body hitbox (anchored top-left).
export const HITBOX_W = 8;
export const HITBOX_H = 11;

// Edge-probing tolerance. Positions are pixel-precise but velocities are
// fractional, so we use a small epsilon to disambiguate "touching" from
// "just inside" the next tile.
const EPSILON = 1e-6;

// Convention from Phase 1 (`aabbIntersects`): edges that merely *touch* do
// NOT count as intersecting — that is the rule we enforce when sweeping
// against tiles (so resting flush against a wall is not a collision).
//
// Two intentional exceptions, both for queries that *want* the touch case:
//   - `isOnGround` (touching the top of a tile = standing on it).
//   - `isTouchingWall` (touching a wall sideways = wall-jump available).
// Both use a small probe past the body edge to detect the tile that the
// body is flush against.

const tileColRangeForX = (x: number, w: number): readonly [number, number] => [
  Math.floor(x / TILE_SIZE),
  Math.floor((x + w - 1) / TILE_SIZE),
];

const tileRowRangeForY = (y: number, h: number): readonly [number, number] => [
  Math.floor(y / TILE_SIZE),
  Math.floor((y + h - 1) / TILE_SIZE),
];

export type SweepXResult = { readonly x: number; readonly hit: boolean };
export type SweepYHit = "ground" | "ceiling" | "none";
export type SweepYResult = { readonly y: number; readonly hit: SweepYHit };

// Sweep horizontally by `dx` against SOLID tiles. JUMPTHRU is ignored on
// the X axis (it is a one-way *vertical* platform — passable laterally).
// Returns the resolved x and whether a wall stopped the motion.
//
// Implementation: enumerate the tile columns the leading edge crosses, in
// the direction of motion. The first column containing any SOLID tile in
// the body's vertical span snaps the body flush against that column's
// edge. Wrap is automatic: `tileAt` modulo-wraps the column index, so a
// body at x=479 sweeping +5 transparently checks the tiles on col 0/1.
export const sweepX = (map: MapData, aabb: AABB, dx: number): SweepXResult => {
  if (dx === 0) return { x: aabb.x, hit: false };

  const [tileTop, tileBottom] = tileRowRangeForY(aabb.y, aabb.h);
  const endX = aabb.x + dx;

  if (dx > 0) {
    const startCol = Math.floor((aabb.x + aabb.w - 1) / TILE_SIZE);
    const endCol = Math.floor((endX + aabb.w - 1) / TILE_SIZE);
    for (let c = startCol + 1; c <= endCol; c++) {
      for (let r = tileTop; r <= tileBottom; r++) {
        if (isSolid(tileAt(map, c, r))) {
          return { x: c * TILE_SIZE - aabb.w, hit: true };
        }
      }
    }
    return { x: endX, hit: false };
  }

  const startCol = Math.floor(aabb.x / TILE_SIZE);
  const endCol = Math.floor(endX / TILE_SIZE);
  for (let c = startCol - 1; c >= endCol; c--) {
    for (let r = tileTop; r <= tileBottom; r++) {
      if (isSolid(tileAt(map, c, r))) {
        return { x: (c + 1) * TILE_SIZE, hit: true };
      }
    }
  }
  return { x: endX, hit: false };
};

// Sweep vertically by `dy`. SOLID is always blocking. JUMPTHRU is solid
// only when (a) the body is moving down (`dy > 0`) AND (b) the body's
// bottom edge was *strictly above* the JUMPTHRU's top edge on the
// previous frame (`prevBottom <= row * TILE_SIZE`). Otherwise — going up
// or already overlapping — the JUMPTHRU is passable. This is the
// "platform you can drop onto from above but jump through from below"
// semantics from spec §5.1.
//
// `prevBottom` must be the body's `y + h` *before* the X sweep
// resolved displacement; it caches the inequality across an entire frame
// so we don't wrongly clip onto a JUMPTHRU we were already inside.
export const sweepY = (
  map: MapData,
  aabb: AABB,
  dy: number,
  prevBottom: number,
): SweepYResult => {
  if (dy === 0) return { y: aabb.y, hit: "none" };

  const [tileLeft, tileRight] = tileColRangeForX(aabb.x, aabb.w);
  const endY = aabb.y + dy;

  if (dy > 0) {
    const startRow = Math.floor((aabb.y + aabb.h - 1) / TILE_SIZE);
    const endRow = Math.floor((endY + aabb.h - 1) / TILE_SIZE);
    for (let r = startRow + 1; r <= endRow; r++) {
      const tileTopY = r * TILE_SIZE;
      for (let c = tileLeft; c <= tileRight; c++) {
        const kind = tileAt(map, c, r);
        const blocking =
          isSolid(kind) || (isJumpthru(kind) && prevBottom <= tileTopY);
        if (blocking) {
          return { y: tileTopY - aabb.h, hit: "ground" };
        }
      }
    }
    return { y: endY, hit: "none" };
  }

  const startRow = Math.floor(aabb.y / TILE_SIZE);
  const endRow = Math.floor(endY / TILE_SIZE);
  for (let r = startRow - 1; r >= endRow; r--) {
    for (let c = tileLeft; c <= tileRight; c++) {
      // JUMPTHRU is always passable when ascending — never a ceiling.
      if (isSolid(tileAt(map, c, r))) {
        return { y: (r + 1) * TILE_SIZE, hit: "ceiling" };
      }
    }
  }
  return { y: endY, hit: "none" };
};

export type MoveAndCollideResult = {
  readonly aabb: AABB;
  readonly hitX: boolean;
  readonly hitY: SweepYHit;
};

// Axis-separated sweep: resolve X first, then Y on the post-X aabb.
// Why separated: collision response is much simpler when each axis is
// independent — sliding along walls "just works", and the JUMPTHRU
// rule only needs to reason about vertical motion. The classic Maddy
// Thorson formulation (TowerFall, Celeste) uses this exact pattern.
export const moveAndCollide = (
  map: MapData,
  aabb: AABB,
  dx: number,
  dy: number,
  prevBottom: number,
): MoveAndCollideResult => {
  const xResult = sweepX(map, aabb, dx);
  const aabbAfterX: AABB = { x: xResult.x, y: aabb.y, w: aabb.w, h: aabb.h };
  const yResult = sweepY(map, aabbAfterX, dy, prevBottom);
  const aabbAfter: AABB = {
    x: aabbAfterX.x,
    y: yResult.y,
    w: aabbAfterX.w,
    h: aabbAfterX.h,
  };
  return { aabb: aabbAfter, hitX: xResult.hit, hitY: yResult.hit };
};

// True if the body is resting on a SOLID tile or on top of a JUMPTHRU.
// We probe one epsilon below the body's bottom edge: if that pixel sits
// inside a SOLID tile, we're grounded; if it sits inside a JUMPTHRU, we
// only count it as ground when the body's bottom is exactly flush with
// the platform's top (`yBottom === probeRow * TILE_SIZE`) — i.e. resting
// on top, not penetrating mid-tile.
export const isOnGround = (map: MapData, aabb: AABB): boolean => {
  const yBottom = aabb.y + aabb.h;
  const probeRow = Math.floor((yBottom + EPSILON) / TILE_SIZE);
  const [tileLeft, tileRight] = tileColRangeForX(aabb.x, aabb.w);
  for (let c = tileLeft; c <= tileRight; c++) {
    const kind = tileAt(map, c, probeRow);
    if (isSolid(kind)) return true;
    if (isJumpthru(kind) && yBottom <= probeRow * TILE_SIZE) return true;
  }
  return false;
};

// True if a SOLID tile is flush against the requested side. JUMPTHRU is
// not a wall — wall-jumps require a real wall.
export const isTouchingWall = (
  map: MapData,
  aabb: AABB,
  side: "L" | "R",
): boolean => {
  const probeX =
    side === "L" ? aabb.x - EPSILON : aabb.x + aabb.w + EPSILON;
  const probeCol = Math.floor(probeX / TILE_SIZE);
  const [tileTop, tileBottom] = tileRowRangeForY(aabb.y, aabb.h);
  for (let r = tileTop; r <= tileBottom; r++) {
    if (isSolid(tileAt(map, probeCol, r))) return true;
  }
  return false;
};

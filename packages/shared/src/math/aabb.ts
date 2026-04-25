import { type Vec2 } from "./vec2.js";

export type AABB = {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
};

// Convention: edges that merely *touch* do NOT count as intersecting.
// e.g. AABB(0..10) and AABB(10..20) → false. Keeps "resting on a tile" unambiguous.
export const aabbIntersects = (a: AABB, b: AABB): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Half-open: a point on the right/bottom edge is *not* inside (mirrors aabbIntersects).
export const aabbContainsPoint = (a: AABB, p: Vec2): boolean =>
  p.x >= a.x && p.x < a.x + a.w && p.y >= a.y && p.y < a.y + a.h;

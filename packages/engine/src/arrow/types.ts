import { type AABB, type Vec2 } from "@arrowfall/shared";

// Phase 3 shipped only Normal. Phase 9a adds Bomb (fuse + AABB explosion).
// Drill and Laser arrive in Phase 9b. Call sites exhaustive-switch on this
// union, so the typechecker forces every step to handle the new member.
export type ArrowType = "normal" | "bomb";

// Lifecycle:
//   flying    — moving under gravity, can hit archers and walls
//   grounded  — landed on a SOLID floor, ramassable after grounded cooldown
//   embedded  — stuck in a SOLID wall (or in an archer that just died);
//               also ramassable after the same cooldown (spec §4.1)
//   exploding — Phase 9a, bomb-only. stepArrow flips to this when the fuse
//               expires or the bomb hits a wall; stepWorld then resolves
//               the AABB explosion (kill archers in radius), removes the
//               arrow and emits a `bomb-exploded` event. The state lives
//               for at most one tick — never serialized to a snapshot a
//               render frame can observe directly.
export type ArrowStatus = "flying" | "grounded" | "embedded" | "exploding";

export type Arrow = {
  readonly id: string;
  readonly type: ArrowType;
  readonly pos: Vec2; // top-left of the 8×2 hitbox
  readonly vel: Vec2;
  readonly ownerId: string; // archer who fired it
  readonly status: ArrowStatus;
  readonly age: number; // frames since spawn
  readonly groundedTimer: number; // > 0 → ignore pickups (spec §4.1, 10-frame grace)
};

// Spec §2.6 — arrow hitbox is 8×2 px, anchored top-left like the archer.
export const ARROW_W = 8;
export const ARROW_H = 2;

export const arrowAabb = (arrow: Arrow): AABB => ({
  x: arrow.pos.x,
  y: arrow.pos.y,
  w: ARROW_W,
  h: ARROW_H,
});

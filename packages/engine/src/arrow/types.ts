import { type AABB, type ArrowType, type Vec2 } from "@arrowfall/shared";

// ArrowType is canonically defined in @arrowfall/shared/constants/arrows
// (the wire schema, renderer and engine all need to agree). We re-export
// it from here so legacy Phase 3–9a call sites that import ArrowType from
// the engine package keep compiling.
export type { ArrowType };

// Lifecycle:
//   flying    — moving under gravity (or not, see ArrowProfile.gravity),
//               can hit archers and walls
//   grounded  — landed on a SOLID floor, ramassable after grounded cooldown
//   embedded  — stuck in a SOLID wall (or in an archer that just died);
//               also ramassable after the same cooldown (spec §4.1)
//   exploding — Phase 9a, used as a "remove this tick" signal for both
//               Bomb (real explosion → kills + event) and Laser (lifetime
//               or bounce-cap exhausted → silent despawn). stepWorld
//               harvests the state within one tick — never serialized
//               to a snapshot a render frame can observe directly.
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
  // Phase 9b — drill arrows pierce up to DRILL_MAX_PIERCES SOLID tiles
  // before their final embed-impact. 0 at spawn; bumped by stepArrow on
  // each tile traversed. Other types ignore this field (it stays 0).
  readonly piercesUsed: number;
  // Phase 9b — laser arrows reflect on SOLID hits up to LASER_MAX_BOUNCES
  // times. 0 at spawn; bumped by stepArrow on each bounce. Other types
  // ignore this field.
  readonly bouncesUsed: number;
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

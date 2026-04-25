import { type Vec2 } from "@arrowfall/shared";
import { HITBOX_H, HITBOX_W } from "../physics/collide.js";

export type ArcherState = "idle" | "dodging";
export type Facing = "L" | "R";

export type Archer = {
  readonly id: string;
  readonly pos: Vec2; // top-left of the 8x11 hitbox
  readonly vel: Vec2;
  readonly facing: Facing;
  readonly state: ArcherState;
  // Timers in frames. 0 = inactive. Decremented by stepArcher.
  readonly dodgeTimer: number;
  readonly dodgeIframeTimer: number;
  readonly dodgeCooldownTimer: number;
  readonly coyoteTimer: number;
  readonly jumpBufferTimer: number;
  // Cached previous-frame bottom edge for the JUMPTHRU semantics — see
  // collide.ts. Reset every step from pos.y + HITBOX_H.
  readonly prevBottom: number;
};

export const createArcher = (
  id: string,
  spawn: Vec2,
  facing: Facing = "R",
): Archer => ({
  id,
  pos: spawn,
  vel: { x: 0, y: 0 },
  facing,
  state: "idle",
  dodgeTimer: 0,
  dodgeIframeTimer: 0,
  dodgeCooldownTimer: 0,
  coyoteTimer: 0,
  jumpBufferTimer: 0,
  prevBottom: spawn.y + HITBOX_H,
});

// Re-exported so callers can build their own AABB from an Archer without
// reaching into ../physics/collide.
export const ARCHER_HITBOX_W = HITBOX_W;
export const ARCHER_HITBOX_H = HITBOX_H;

import {
  type AABB,
  type ArcherInput,
  GRAVITY,
  MAX_FALL_SPEED,
  type MapData,
} from "@arrowfall/shared";
import {
  HITBOX_H,
  HITBOX_W,
  isOnGround,
  isTouchingWall,
  moveAndCollide,
} from "../physics/collide.js";
import { wrapPosition } from "../tilemap/grid.js";
import { applyDodge } from "./dodge.js";
import { applyFastFall } from "./fastfall.js";
import { applyJump } from "./jump.js";
import { type Archer } from "./types.js";
import { applyWalk } from "./walk.js";

const aabbOf = (archer: Archer): AABB => ({
  x: archer.pos.x,
  y: archer.pos.y,
  w: HITBOX_W,
  h: HITBOX_H,
});

// Public API. Pure: returns a fresh Archer; never mutates.
//
// The order below is load-bearing — it keeps determinism predictable
// and the JUMPTHRU semantics consistent across client prediction and
// server authoritative simulation:
//
//   1. Probe environment from the current AABB (before any input
//      changes vel) — onGround and wall contacts are snapshots.
//   2. applyDodge first: a fresh dodge press takes priority over
//      walk/jump (it sets vel directly and locks state until the
//      dodge timer elapses).
//   3. If not dodging this frame, run the normal kinematic chain:
//      walk → jump → gravity → fast-fall. Gravity comes after jump
//      so JUMP_VELOCITY is applied cleanly without a frame of falling
//      pulling on it.
//   4. Cache prevBottom from pos.y before any movement — that is the
//      "previous-frame bottom edge" the JUMPTHRU rule needs.
//   5. Sweep X then Y; clear the matching velocity component on hit
//      so we don't keep accumulating into a wall.
//   6. Decrement timers. Crucially, coyote and buffer only decrement
//      on frames where they were *not* refilled (otherwise a single
//      grounded frame would deplete coyote to GRACE-1 immediately,
//      shrinking the window by one).
//   7. Wrap the final position — wrap is applied at the position
//      level, not inside collision, so sweep semantics stay simple.
export const stepArcher = (
  archer: Archer,
  input: ArcherInput,
  map: MapData,
): Archer => {
  // 1. Probe the world.
  const startAabb = aabbOf(archer);
  const onGround = isOnGround(map, startAabb);
  const touchingWallL = isTouchingWall(map, startAabb, "L");
  const touchingWallR = isTouchingWall(map, startAabb, "R");

  // 2. Dodge — may transition state and overwrite vel.
  let next = applyDodge(archer, input);

  // 3. If we're not in a dodge this frame, run the standard chain.
  if (next.state !== "dodging") {
    next = applyWalk(next, input, onGround);
    next = applyJump(next, input, { onGround, touchingWallL, touchingWallR });

    // Inline gravity (semi-implicit Euler), clamped to MAX_FALL_SPEED.
    // We don't call stepGravity from physics/body because that helper
    // also moves the position; here, motion is owned by moveAndCollide.
    const candidateVy = next.vel.y + GRAVITY;
    const newVy =
      candidateVy > MAX_FALL_SPEED ? MAX_FALL_SPEED : candidateVy;
    next = { ...next, vel: { x: next.vel.x, y: newVy } };

    next = applyFastFall(next, input);
  }

  // 4. Cache prevBottom before moving — used by the JUMPTHRU rule in sweepY.
  const prevBottom = next.pos.y + HITBOX_H;

  // 5. Move and resolve tile collisions on each axis independently.
  const move = moveAndCollide(
    map,
    aabbOf(next),
    next.vel.x,
    next.vel.y,
    prevBottom,
  );
  let vx = next.vel.x;
  let vy = next.vel.y;
  if (move.hitX) vx = 0;
  if (move.hitY !== "none") vy = 0;

  // 6. Decrement timers.
  //    coyote/buffer: only when not refilled this frame (see applyJump).
  const coyoteTimer = onGround
    ? next.coyoteTimer
    : Math.max(0, next.coyoteTimer - 1);
  const jumpBufferTimer = input.jump
    ? next.jumpBufferTimer
    : Math.max(0, next.jumpBufferTimer - 1);
  const dodgeIframeTimer = Math.max(0, next.dodgeIframeTimer - 1);
  const dodgeCooldownTimer = Math.max(0, next.dodgeCooldownTimer - 1);

  // 7. Wrap final position. Position is the only thing that wraps —
  //    velocity and timers are unaffected.
  const wrappedPos = wrapPosition({ x: move.aabb.x, y: move.aabb.y });

  return {
    ...next,
    pos: wrappedPos,
    vel: { x: vx, y: vy },
    coyoteTimer,
    jumpBufferTimer,
    dodgeIframeTimer,
    dodgeCooldownTimer,
    prevBottom,
  };
};

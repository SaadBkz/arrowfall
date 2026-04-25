import {
  type MapData,
  GRAVITY,
  MAX_FALL_SPEED,
} from "@arrowfall/shared";
import { sweepX, sweepY } from "../physics/collide.js";
import { wrapPosition } from "../tilemap/grid.js";
import { type Arrow, arrowAabb } from "./types.js";

// Pure: returns a fresh Arrow.
//
// Phase 3 ships only Normal arrows. Behaviour:
//   - flying  : semi-implicit Euler with GRAVITY clamped at MAX_FALL_SPEED
//               (mirrors stepGravity / stepArcher), then axis-separated
//               sweep. Only SOLID tiles block — JUMPTHRU and SPIKE are
//               passable for arrows in this phase. On any axis impact the
//               arrow embeds at the post-resolution position with vel=0.
//   - grounded / embedded : no movement, decrement groundedTimer.
//   - age increments unconditionally.
//   - position wraps at the framebuffer edges, just like archers.
//
// We pass a dummy `prevBottom` to sweepY (any value past the arena floor
// works) since JUMPTHRU is ignored for arrows and prevBottom is only
// consulted when JUMPTHRU rules apply.
export const stepArrow = (arrow: Arrow, map: MapData): Arrow => {
  const age = arrow.age + 1;

  if (arrow.status !== "flying") {
    const groundedTimer = Math.max(0, arrow.groundedTimer - 1);
    return { ...arrow, age, groundedTimer };
  }

  // Semi-implicit Euler: apply gravity to vy, then sweep.
  const candidateVy = arrow.vel.y + GRAVITY;
  const newVy = candidateVy > MAX_FALL_SPEED ? MAX_FALL_SPEED : candidateVy;
  const dx = arrow.vel.x;
  const dy = newVy;

  const startAabb = arrowAabb(arrow);

  // Sweep against SOLID only. JUMPTHRU / SPIKE are passable so we do NOT
  // route this through moveAndCollide (which honours JUMPTHRU). sweepX /
  // sweepY both already filter on isSolid only, which matches our needs.
  const xResult = sweepX(map, startAabb, dx);
  const aabbAfterX = { ...startAabb, x: xResult.x };
  // prevBottom only matters for JUMPTHRU; pick a sentinel that disables
  // the rule (any value ≥ all JUMPTHRU tile-tops in the arena suffices).
  const yResult = sweepY(map, aabbAfterX, dy, Number.POSITIVE_INFINITY);

  const hit = xResult.hit || yResult.hit !== "none";

  const wrapped = wrapPosition({ x: xResult.x, y: yResult.y });

  if (hit) {
    return {
      ...arrow,
      pos: wrapped,
      vel: { x: 0, y: 0 },
      status: "embedded",
      age,
      groundedTimer: 0,
    };
  }

  return {
    ...arrow,
    pos: wrapped,
    vel: { x: dx, y: newVy },
    age,
  };
};

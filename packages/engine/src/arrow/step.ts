import {
  ARROW_GROUNDED_PICKUP_DELAY,
  BOMB_FUSE_FRAMES,
  type MapData,
  GRAVITY,
  MAX_FALL_SPEED,
} from "@arrowfall/shared";
import { sweepX, sweepY } from "../physics/collide.js";
import { wrapPosition } from "../tilemap/grid.js";
import { type Arrow, type ArrowStatus, arrowAabb } from "./types.js";

// Pure: returns a fresh Arrow.
//
// Behaviour by type / status:
//   - normal flying   : semi-implicit Euler with GRAVITY clamped at
//                       MAX_FALL_SPEED, axis-separated sweep against
//                       SOLID only (JUMPTHRU / SPIKE are passable for
//                       arrows). On any axis impact the arrow embeds at
//                       the post-resolution position with vel=0.
//   - bomb flying     : same physics, but a wall hit OR `age + 1 >=
//                       BOMB_FUSE_FRAMES` flips status to "exploding"
//                       at the resolved position. stepWorld resolves
//                       the explosion the same tick (kills + event +
//                       removal). Never lands as grounded/embedded.
//   - grounded/embed  : no movement, decrement groundedTimer.
//   - exploding       : transient — left for stepWorld to harvest. We
//                       don't mutate it further here (idempotent).
//   - age increments unconditionally.
//   - position wraps at the framebuffer edges, just like archers.
//
// We pass a sentinel `prevBottom` to sweepY (any value past the arena
// floor works) since JUMPTHRU is ignored for arrows and prevBottom is
// only consulted when JUMPTHRU rules apply.
export const stepArrow = (arrow: Arrow, map: MapData): Arrow => {
  const age = arrow.age + 1;

  if (arrow.status === "exploding") {
    // Idempotent — stepWorld picks it up this same frame.
    return { ...arrow, age };
  }

  if (arrow.status !== "flying") {
    const groundedTimer = Math.max(0, arrow.groundedTimer - 1);
    return { ...arrow, age, groundedTimer };
  }

  // Bomb fuse check BEFORE the move sweep. If the fuse just expired,
  // the bomb explodes at its current position — no extra movement this
  // frame. Same boundary as a wall hit (status="exploding") so
  // stepWorld harvests both code paths uniformly.
  if (arrow.type === "bomb" && age >= BOMB_FUSE_FRAMES) {
    return { ...arrow, age, status: "exploding", vel: { x: 0, y: 0 } };
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
    if (arrow.type === "bomb") {
      // Bomb on impact → explode at the resolved position.
      return {
        ...arrow,
        pos: wrapped,
        vel: { x: 0, y: 0 },
        status: "exploding",
        age,
      };
    }
    // Normal arrow: distinguish floor-landing (grounded, lies flat)
    // from wall/ceiling impact (embedded, sticks out of the surface).
    // Both are pickable after ARROW_GROUNDED_PICKUP_DELAY frames; the
    // distinction is mostly cosmetic for the renderer.
    const status: ArrowStatus =
      yResult.hit === "ground" ? "grounded" : "embedded";
    return {
      ...arrow,
      pos: wrapped,
      vel: { x: 0, y: 0 },
      status,
      age,
      groundedTimer: ARROW_GROUNDED_PICKUP_DELAY,
    };
  }

  return {
    ...arrow,
    pos: wrapped,
    vel: { x: dx, y: newVy },
    age,
  };
};

import {
  ARROW_GROUNDED_PICKUP_DELAY,
  arrowProfile,
  BOMB_FUSE_FRAMES,
  DRILL_MAX_PIERCES,
  GRAVITY,
  LASER_LIFETIME_FRAMES,
  LASER_MAX_BOUNCES,
  type MapData,
  MAX_FALL_SPEED,
} from "@arrowfall/shared";
import { sweepX, sweepY } from "../physics/collide.js";
import { wrapPosition } from "../tilemap/grid.js";
import { type Arrow, type ArrowStatus, arrowAabb } from "./types.js";

// Pure: returns a fresh Arrow.
//
// Behaviour by impact mode (driven by ARROW_PROFILES in shared, keyed by
// arrow.type):
//   - "embed"   (Normal, Drill after final pierce): semi-implicit Euler,
//               sweep against SOLID, on hit clamp + status="embedded" /
//               "grounded" + pickup grace.
//   - "explode" (Bomb): same physics + fuse check; either path flips
//               status to "exploding" and lets stepWorld harvest the
//               blast.
//   - "pierce"  (Drill while piercesUsed < DRILL_MAX_PIERCES): on first
//               SOLID hit, increment piercesUsed and slide the arrow
//               PAST the offending tile (so the next sweep starts on
//               the far side), with the leftover delta consumed.
//               When piercesUsed reaches the cap, the impact mode
//               implicitly downgrades to "embed" via this same step.
//   - "bounce"  (Laser): no gravity, sweep, on hit reflect velocity
//               perpendicular to the surface and bump bouncesUsed. The
//               arrow despawns (status="exploding" — same one-tick
//               removal signal stepWorld already harvests for bombs)
//               when bouncesUsed == LASER_MAX_BOUNCES OR
//               age >= LASER_LIFETIME_FRAMES.
//   - grounded/embed: no movement, decrement groundedTimer.
//   - exploding   : transient — left for stepWorld to harvest.
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

  const profile = arrowProfile(arrow.type);

  // Bomb fuse check BEFORE the move sweep. If the fuse just expired,
  // the bomb explodes at its current position — no extra movement this
  // frame. Same boundary as a wall hit (status="exploding") so
  // stepWorld harvests both code paths uniformly.
  if (arrow.type === "bomb" && age >= BOMB_FUSE_FRAMES) {
    return { ...arrow, age, status: "exploding", vel: { x: 0, y: 0 } };
  }

  // Laser lifetime check BEFORE the move sweep. Spec §4.2: lasers
  // disappear after LASER_LIFETIME_FRAMES regardless of remaining
  // bounces. We re-use status="exploding" as the "remove this tick"
  // signal — stepWorld already filters those out without emitting an
  // event (the bomb branch emits one; lasers don't, so stepWorld must
  // skip its event-emit when arrow.type === "laser" — handled there).
  if (arrow.type === "laser" && age >= LASER_LIFETIME_FRAMES) {
    return { ...arrow, age, status: "exploding", vel: { x: 0, y: 0 } };
  }

  // Semi-implicit Euler: apply gravity to vy if the profile uses it,
  // then sweep. Lasers skip gravity entirely (profile.gravity = false).
  let newVy: number;
  if (profile.gravity) {
    const candidateVy = arrow.vel.y + GRAVITY;
    newVy = candidateVy > MAX_FALL_SPEED ? MAX_FALL_SPEED : candidateVy;
  } else {
    newVy = arrow.vel.y;
  }
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

  if (!hit) {
    const wrapped = wrapPosition({ x: xResult.x, y: yResult.y });
    return {
      ...arrow,
      pos: wrapped,
      vel: { x: dx, y: newVy },
      age,
    };
  }

  // ─── Impact resolution by profile ────────────────────────────────
  // We're at a SOLID hit on at least one axis. Position pre-wrap is
  // already clamped against the wall by sweepX/sweepY.
  const impactX = xResult.x;
  const impactY = yResult.y;
  const wrappedAtImpact = wrapPosition({ x: impactX, y: impactY });

  // Bomb → explode at the resolved position.
  if (profile.impact === "explode") {
    return {
      ...arrow,
      pos: wrappedAtImpact,
      vel: { x: 0, y: 0 },
      status: "exploding",
      age,
    };
  }

  // Drill → pierce one SOLID and keep flying for one more impact, OR
  // embed if we've already used our pierce budget.
  if (profile.impact === "pierce" && arrow.piercesUsed < DRILL_MAX_PIERCES) {
    // Skip past the blocking tile by carrying the leftover horizontal
    // and/or vertical delta. The arrow keeps its full velocity — no
    // damping on pierce, the visual reads "drilled through cleanly".
    //
    // Implementation: advance the arrow's position by the FULL
    // requested delta (dx, dy) and let the next stepArrow sweep
    // re-test the new starting AABB. The pierced tile is wider than
    // the per-frame delta in normal play (TILE_SIZE=16 > speed=5), so
    // a single frame's leftover always lands us on the far side and
    // the next sweep no longer hits the same tile. This avoids
    // re-sweeping in this frame (which would loop on a tile cluster).
    const advancedX = arrow.pos.x + dx;
    const advancedY = arrow.pos.y + dy;
    const wrappedAdvanced = wrapPosition({ x: advancedX, y: advancedY });
    return {
      ...arrow,
      pos: wrappedAdvanced,
      vel: { x: dx, y: newVy },
      age,
      piercesUsed: arrow.piercesUsed + 1,
    };
  }

  // Laser → bounce up to LASER_MAX_BOUNCES times, then despawn.
  if (profile.impact === "bounce") {
    const nextBounces = arrow.bouncesUsed + 1;
    if (nextBounces > LASER_MAX_BOUNCES) {
      // Bounce budget exhausted — despawn this tick (silently — no
      // explosion event, stepWorld removes it without emitting).
      return {
        ...arrow,
        pos: wrappedAtImpact,
        vel: { x: 0, y: 0 },
        status: "exploding",
        age,
      };
    }
    // Reflect each axis whose sweep returned a hit. For corner hits
    // (both axes hit simultaneously) we flip both — the arrow
    // bounces back along the diagonal.
    let reflectedVx = dx;
    let reflectedVy = newVy;
    if (xResult.hit) reflectedVx = -reflectedVx;
    if (yResult.hit !== "none") reflectedVy = -reflectedVy;
    return {
      ...arrow,
      pos: wrappedAtImpact,
      vel: { x: reflectedVx, y: reflectedVy },
      age,
      bouncesUsed: nextBounces,
    };
  }

  // Default impact = "embed" (Normal arrow, or Drill after its final
  // pierce). Distinguish floor-landing (grounded, lies flat) from
  // wall/ceiling impact (embedded, sticks out of the surface). Both
  // are pickable after ARROW_GROUNDED_PICKUP_DELAY frames.
  const status: ArrowStatus =
    yResult.hit === "ground" ? "grounded" : "embedded";
  return {
    ...arrow,
    pos: wrappedAtImpact,
    vel: { x: 0, y: 0 },
    status,
    age,
    groundedTimer: ARROW_GROUNDED_PICKUP_DELAY,
  };
};

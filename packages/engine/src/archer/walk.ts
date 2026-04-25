import {
  type ArcherInput,
  WALK_ACCEL,
  WALK_FRICTION_AIR,
  WALK_FRICTION_GROUND,
  WALK_MAX_SPEED,
  approachZero,
  clamp,
} from "@arrowfall/shared";
import { type Archer, type Facing } from "./types.js";

// Horizontal motion only — vel.y is left untouched (jump/gravity own it).
// Pressing left and right simultaneously cancels: net dpad value drives
// acceleration; release returns velocity to zero via friction.
export const applyWalk = (
  archer: Archer,
  input: ArcherInput,
  onGround: boolean,
): Archer => {
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  let vx: number;
  let facing: Facing = archer.facing;
  if (dx !== 0) {
    vx = clamp(archer.vel.x + dx * WALK_ACCEL, -WALK_MAX_SPEED, WALK_MAX_SPEED);
    facing = dx > 0 ? "R" : "L";
  } else {
    const friction = onGround ? WALK_FRICTION_GROUND : WALK_FRICTION_AIR;
    vx = approachZero(archer.vel.x, friction);
  }

  return { ...archer, vel: { x: vx, y: archer.vel.y }, facing };
};

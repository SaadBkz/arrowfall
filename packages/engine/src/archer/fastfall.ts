import { type ArcherInput, FAST_FALL_SPEED } from "@arrowfall/shared";
import { type Archer } from "./types.js";

// Snaps downward velocity to FAST_FALL_SPEED when "down" is held while
// already falling. Only kicks in once vy > 0 — pressing down on the way
// up does nothing (matches TowerFall: down is fast-fall, not air-stomp).
export const applyFastFall = (archer: Archer, input: ArcherInput): Archer => {
  if (input.down && archer.vel.y > 0 && archer.vel.y < FAST_FALL_SPEED) {
    return { ...archer, vel: { x: archer.vel.x, y: FAST_FALL_SPEED } };
  }
  return archer;
};

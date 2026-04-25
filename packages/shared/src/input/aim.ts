import { directionToVec2 } from "../math/direction.js";
import { type Vec2 } from "../math/vec2.js";
import { type ArcherInput } from "./types.js";

// Aim is independent from walk so a player can run right while shooting up.
// When no direction is held the shot defaults to horizontal toward `facing`,
// matching TowerFall: simply tapping the shoot button always fires forward.
// Returns a unit vector — callers scale by ARROW_SPEED to obtain velocity.
export const aimVector = (
  input: ArcherInput,
  facing: "L" | "R",
): Vec2 => {
  if (input.aimDirection !== null) {
    return directionToVec2(input.aimDirection);
  }
  return { x: facing === "R" ? 1 : -1, y: 0 };
};

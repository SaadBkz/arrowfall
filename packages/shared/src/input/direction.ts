import { type Direction8 } from "../math/direction.js";
import { type ArcherInput } from "./types.js";

// Maps the 4 dpad bits to one of the 8 compass directions, or null if no
// directional input is held. Consumed by the dodge state machine to decide
// the dash vector. Opposite directions held simultaneously cancel out on the
// affected axis (matches TowerFall's behaviour).
export const inputDirection = (input: ArcherInput): Direction8 | null => {
  const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (dx === 0 && dy === 0) return null;
  if (dx === 0 && dy === -1) return "N";
  if (dx === 1 && dy === -1) return "NE";
  if (dx === 1 && dy === 0) return "E";
  if (dx === 1 && dy === 1) return "SE";
  if (dx === 0 && dy === 1) return "S";
  if (dx === -1 && dy === 1) return "SW";
  if (dx === -1 && dy === 0) return "W";
  return "NW";
};

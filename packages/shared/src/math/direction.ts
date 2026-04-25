import { type Vec2 } from "./vec2.js";

export type Direction8 = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

const SQRT_HALF = Math.SQRT1_2; // 1/√2 — diagonals are unit-length.

const TABLE: Record<Direction8, Vec2> = {
  N: { x: 0, y: -1 },
  NE: { x: SQRT_HALF, y: -SQRT_HALF },
  E: { x: 1, y: 0 },
  SE: { x: SQRT_HALF, y: SQRT_HALF },
  S: { x: 0, y: 1 },
  SW: { x: -SQRT_HALF, y: SQRT_HALF },
  W: { x: -1, y: 0 },
  NW: { x: -SQRT_HALF, y: -SQRT_HALF },
};

export const directionToVec2 = (d: Direction8): Vec2 => TABLE[d];

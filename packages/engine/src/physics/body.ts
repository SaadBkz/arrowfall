import { GRAVITY, MAX_FALL_SPEED, type Vec2 } from "@arrowfall/shared";

export type Body = { readonly pos: Vec2; readonly vel: Vec2 };

// Pure: returns a fresh Body, never mutates. Semi-implicit Euler:
//   vel := min(vel.y + GRAVITY · dt, MAX_FALL_SPEED)
//   pos := pos + vel · dt
// Tile collision arrives in Phase 2 — this is the gravity primitive only.
export const stepGravity = (body: Body, dt: number = 1): Body => {
  const candidateVy = body.vel.y + GRAVITY * dt;
  const newVy = candidateVy > MAX_FALL_SPEED ? MAX_FALL_SPEED : candidateVy;
  const newPy = body.pos.y + newVy * dt;
  return {
    pos: { x: body.pos.x, y: newPy },
    vel: { x: body.vel.x, y: newVy },
  };
};

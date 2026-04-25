import {
  type ArcherInput,
  JUMP_BUFFER_FRAMES,
  JUMP_GRACE_FRAMES,
  JUMP_VELOCITY,
  WALL_JUMP_VELOCITY_X,
  WALL_JUMP_VELOCITY_Y,
} from "@arrowfall/shared";
import { type Archer } from "./types.js";

export type JumpEnv = {
  readonly onGround: boolean;
  readonly touchingWallL: boolean;
  readonly touchingWallR: boolean;
};

// Coyote + buffer + wall-jump in one place.
//
// Timer convention (matches stepArcher's end-of-frame decrement):
//   - coyoteTimer   : refilled to JUMP_GRACE_FRAMES while onGround. Held
//                     across a frame transition so a player who walked
//                     off an edge still has GRACE frames to react.
//   - jumpBufferTimer: refilled to JUMP_BUFFER_FRAMES on the press edge.
//                      A player who pressed jump just before landing can
//                      consume the still-warm buffer at the moment they
//                      touch the ground.
//
// Both timers are decremented in stepArcher *only* on frames where they
// were not refilled this frame, so the freshly-set value isn't
// immediately depleted (off-by-one trap).
export const applyJump = (
  archer: Archer,
  input: ArcherInput,
  env: JumpEnv,
): Archer => {
  const coyoteTimer = env.onGround ? JUMP_GRACE_FRAMES : archer.coyoteTimer;
  const jumpBufferTimer = input.jump
    ? JUMP_BUFFER_FRAMES
    : archer.jumpBufferTimer;

  let vx = archer.vel.x;
  let vy = archer.vel.y;
  let coyote = coyoteTimer;
  let buffer = jumpBufferTimer;

  if (buffer > 0 && coyote > 0) {
    // Ground / coyote jump: cancels both timers so the buffer can't
    // double-trigger and a fresh coyote refill on next ground touch.
    vy = JUMP_VELOCITY;
    coyote = 0;
    buffer = 0;
  } else if (buffer > 0 && (env.touchingWallL || env.touchingWallR)) {
    // Wall jump: kick away from whichever wall we're flush against.
    // If somehow flush against both (very tight gap), prefer the left
    // wall and kick right — deterministic tie-break.
    const sign = env.touchingWallL ? 1 : -1;
    vx = sign * WALL_JUMP_VELOCITY_X;
    vy = WALL_JUMP_VELOCITY_Y;
    buffer = 0;
  }

  return {
    ...archer,
    vel: { x: vx, y: vy },
    coyoteTimer: coyote,
    jumpBufferTimer: buffer,
  };
};

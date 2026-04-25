import { describe, expect, it } from "vitest";
import {
  type ArcherInput,
  NEUTRAL_INPUT,
  WALL_JUMP_VELOCITY_X,
  WALL_JUMP_VELOCITY_Y,
} from "@arrowfall/shared";
import { applyJump, type JumpEnv } from "./jump.js";
import { createArcher } from "./types.js";

const jumpInput: ArcherInput = { ...NEUTRAL_INPUT, jump: true };

const env = (wallL: boolean, wallR: boolean): JumpEnv => ({
  onGround: false,
  touchingWallL: wallL,
  touchingWallR: wallR,
});

describe("applyJump — wall jump", () => {
  it("kicks right (vx > 0) when flush against a wall on the LEFT", () => {
    let a = createArcher("x", { x: 100, y: 100 });
    a = applyJump(a, jumpInput, env(true, false));
    expect(a.vel.x).toBe(WALL_JUMP_VELOCITY_X);
    expect(a.vel.y).toBe(WALL_JUMP_VELOCITY_Y);
    expect(a.jumpBufferTimer).toBe(0);
  });

  it("kicks left (vx < 0) when flush against a wall on the RIGHT", () => {
    let a = createArcher("x", { x: 100, y: 100 });
    a = applyJump(a, jumpInput, env(false, true));
    expect(a.vel.x).toBe(-WALL_JUMP_VELOCITY_X);
    expect(a.vel.y).toBe(WALL_JUMP_VELOCITY_Y);
  });

  it("ground/coyote jump takes priority over wall-jump if both are available", () => {
    let a = createArcher("x", { x: 100, y: 100 });
    // onGround AND wall-touching: ground jump wins (no horizontal kick).
    a = applyJump(a, jumpInput, {
      onGround: true,
      touchingWallL: true,
      touchingWallR: false,
    });
    expect(a.vel.x).toBe(0);
    // Ground JUMP_VELOCITY, not WALL_JUMP_VELOCITY_Y.
    expect(a.vel.y).toBeLessThan(WALL_JUMP_VELOCITY_Y);
  });

  it("does nothing without a fresh buffer", () => {
    const a = applyJump(
      createArcher("x", { x: 100, y: 100 }),
      NEUTRAL_INPUT,
      env(true, false),
    );
    expect(a.vel.x).toBe(0);
    expect(a.vel.y).toBe(0);
  });
});

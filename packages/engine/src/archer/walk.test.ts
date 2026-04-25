import { describe, expect, it } from "vitest";
import {
  type ArcherInput,
  NEUTRAL_INPUT,
  WALK_ACCEL,
  WALK_FRICTION_AIR,
  WALK_FRICTION_GROUND,
  WALK_MAX_SPEED,
} from "@arrowfall/shared";
import { type Archer, createArcher } from "./types.js";
import { applyWalk } from "./walk.js";

const right: ArcherInput = { ...NEUTRAL_INPUT, right: true };
const left: ArcherInput = { ...NEUTRAL_INPUT, left: true };

const stepWalkN = (
  archer: Archer,
  input: ArcherInput,
  onGround: boolean,
  n: number,
): Archer => {
  let a = archer;
  for (let i = 0; i < n; i++) a = applyWalk(a, input, onGround);
  return a;
};

describe("applyWalk", () => {
  it("accelerates from 0 by WALK_ACCEL per frame while a direction is held", () => {
    let a = createArcher("x", { x: 100, y: 100 });
    a = applyWalk(a, right, true);
    expect(a.vel.x).toBeCloseTo(WALK_ACCEL, 12);
    a = applyWalk(a, right, true);
    expect(a.vel.x).toBeCloseTo(WALK_ACCEL * 2, 12);
    a = applyWalk(a, right, true);
    expect(a.vel.x).toBeCloseTo(WALK_ACCEL * 3, 12);
  });

  it("clamps at WALK_MAX_SPEED no matter how long the input is held", () => {
    // WALK_MAX_SPEED / WALK_ACCEL = 10 frames to reach max from rest.
    const a = stepWalkN(createArcher("x", { x: 0, y: 0 }), right, true, 50);
    expect(a.vel.x).toBe(WALK_MAX_SPEED);
  });

  it("clamps to the negative bound when walking left", () => {
    const a = stepWalkN(createArcher("x", { x: 0, y: 0 }), left, true, 50);
    expect(a.vel.x).toBe(-WALK_MAX_SPEED);
  });

  it("decelerates faster on the ground than in the air", () => {
    const at = WALK_MAX_SPEED;
    const ground = applyWalk(
      { ...createArcher("x", { x: 0, y: 0 }), vel: { x: at, y: 0 } },
      NEUTRAL_INPUT,
      true,
    );
    const air = applyWalk(
      { ...createArcher("x", { x: 0, y: 0 }), vel: { x: at, y: 0 } },
      NEUTRAL_INPUT,
      false,
    );
    expect(ground.vel.x).toBeCloseTo(at - WALK_FRICTION_GROUND, 12);
    expect(air.vel.x).toBeCloseTo(at - WALK_FRICTION_AIR, 12);
    expect(at - ground.vel.x).toBeGreaterThan(at - air.vel.x);
  });

  it("never overshoots zero — friction halts cleanly at 0", () => {
    let a: Archer = {
      ...createArcher("x", { x: 0, y: 0 }),
      vel: { x: 0.05, y: 0 },
    };
    a = applyWalk(a, NEUTRAL_INPUT, true);
    expect(a.vel.x).toBe(0);
  });

  it("updates facing in the direction the player is pressing", () => {
    let a = createArcher("x", { x: 0, y: 0 }, "L");
    a = applyWalk(a, right, true);
    expect(a.facing).toBe("R");
    a = applyWalk(a, left, true);
    expect(a.facing).toBe("L");
  });

  it("does not touch vel.y", () => {
    const a = applyWalk(
      { ...createArcher("x", { x: 0, y: 0 }), vel: { x: 0, y: 2.5 } },
      right,
      true,
    );
    expect(a.vel.y).toBe(2.5);
  });
});

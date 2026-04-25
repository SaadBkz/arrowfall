import { describe, expect, it } from "vitest";
import { GRAVITY, MAX_FALL_SPEED } from "@arrowfall/shared";
import { stepGravity, type Body } from "./physics/body.js";

const startAtRest = (): Body => ({ pos: { x: 100, y: 0 }, vel: { x: 0, y: 0 } });

const stepN = (start: Body, n: number): Body => {
  let b = start;
  for (let i = 0; i < n; i++) b = stepGravity(b);
  return b;
};

describe("stepGravity (spec §2.1)", () => {
  it("references the spec values exactly", () => {
    expect(GRAVITY).toBe(0.3);
    expect(MAX_FALL_SPEED).toBe(4.0);
  });

  it("is pure — does not mutate its input", () => {
    const start = startAtRest();
    stepGravity(start);
    expect(start).toEqual(startAtRest());
  });

  it("preserves x position and x-velocity across many frames", () => {
    const b = stepN(startAtRest(), 100);
    expect(b.pos.x).toBe(100);
    expect(b.vel.x).toBe(0);
  });

  // The "first deterministic test" of the roadmap. Tolerance: 0.
  // Two parallel runs of the same pure function on the same input must
  // produce bit-identical floating-point output every frame.
  it("is deterministic — two parallel runs are bit-identical", () => {
    let a = startAtRest();
    let c = startAtRest();
    for (let i = 0; i < 200; i++) {
      a = stepGravity(a);
      c = stepGravity(c);
      expect(a.pos.y).toBe(c.pos.y);
      expect(a.vel.y).toBe(c.vel.y);
    }
  });

  // Hand-calculated table. Semi-implicit Euler:
  //   vy_{n+1} = min(vy_n + GRAVITY, MAX_FALL_SPEED)
  //   py_{n+1} = py_n + vy_{n+1}
  // From rest: vy(n) = 0.3 · n until clamp. Clamp kicks in at n = 14
  // (since 0.3 · 13 = 3.9 < 4.0 ≤ 0.3 · 14 = 4.2).
  // Position before clamp: y(n) = 0.3 · n(n+1)/2 = 0.15 · n · (n+1).
  // y(13) = 0.15 · 13 · 14 = 27.3.
  // After clamp: y(n) = y(13) + (n − 13) · MAX_FALL_SPEED.
  it("matches the hand-calculated spec table", () => {
    const cases: Array<{ n: number; vy: number; y: number }> = [
      { n: 1, vy: 0.3, y: 0.3 },
      { n: 2, vy: 0.6, y: 0.9 },
      { n: 3, vy: 0.9, y: 1.8 },
      { n: 5, vy: 1.5, y: 4.5 },
      { n: 10, vy: 3.0, y: 16.5 },
      { n: 13, vy: 3.9, y: 27.3 },
      // Frame 14: 3.9 + 0.3 = 4.2 → clamped to MAX_FALL_SPEED.
      { n: 14, vy: MAX_FALL_SPEED, y: 27.3 + MAX_FALL_SPEED },
      { n: 15, vy: MAX_FALL_SPEED, y: 27.3 + 2 * MAX_FALL_SPEED },
      { n: 100, vy: MAX_FALL_SPEED, y: 27.3 + (100 - 13) * MAX_FALL_SPEED },
    ];
    for (const { n, vy, y } of cases) {
      const b = stepN(startAtRest(), n);
      // 9 digits ≈ 5e-10 — comfortably above accumulated 0.3-rounding drift.
      expect(b.vel.y).toBeCloseTo(vy, 9);
      expect(b.pos.y).toBeCloseTo(y, 9);
    }
  });

  // Already at terminal velocity: integer arithmetic only, exact equality.
  it("at terminal velocity, advances by exactly MAX_FALL_SPEED per frame", () => {
    let b: Body = { pos: { x: 100, y: 0 }, vel: { x: 0, y: MAX_FALL_SPEED } };
    for (let i = 1; i <= 5; i++) {
      b = stepGravity(b);
      expect(b.vel.y).toBe(MAX_FALL_SPEED);
      expect(b.pos.y).toBe(i * MAX_FALL_SPEED);
    }
  });

  it("respects a non-default dt (dt = 2 doubles per-frame velocity gain)", () => {
    const b = stepGravity(startAtRest(), 2);
    expect(b.vel.y).toBeCloseTo(GRAVITY * 2, 12);
    expect(b.pos.y).toBeCloseTo(GRAVITY * 2 * 2, 12);
  });
});

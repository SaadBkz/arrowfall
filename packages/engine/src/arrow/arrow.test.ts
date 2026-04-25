import { describe, expect, it } from "vitest";
import {
  ARENA_WIDTH_PX,
  ARROW_GROUNDED_PICKUP_DELAY,
  ARROW_SPEED,
  type MapData,
  type MapJson,
} from "@arrowfall/shared";
import { parseMap } from "../tilemap/loader.js";
import testArenaWallsJson from "../__fixtures__/maps/test-arena-walls.json" with { type: "json" };
import { stepArrow } from "./step.js";
import { type Arrow } from "./types.js";

const blankMap = (): MapData => {
  const json: MapJson = {
    id: "blank",
    name: "Blank",
    width: 30,
    height: 17,
    rows: Array.from({ length: 17 }, () => ".".repeat(30)),
  };
  return parseMap(json);
};

const wallsMap = parseMap(testArenaWallsJson as MapJson);

const flyingE = (x: number, y: number, owner = "shooter"): Arrow => ({
  id: "test",
  type: "normal",
  pos: { x, y },
  vel: { x: ARROW_SPEED, y: 0 },
  ownerId: owner,
  status: "flying",
  age: 0,
  groundedTimer: 0,
});

describe("stepArrow — ballistics (E direction, hand table)", () => {
  // With aimDirection = E: vel0 = (5, 0). Semi-implicit Euler:
  //   vy(n) = min(0.3 · n, 4.0)  for n ≤ 13; clamped at 4.0 for n ≥ 14
  //   pos.y(n) = sum_{i=1..n} vy(i)
  //   pos.x(n) = pos.x(0) + 5 · n
  // The arrow stays above the floor and away from any wall over 20
  // frames starting at (100, 100) on a blank map, so no sweep collision
  // interferes with the closed-form trajectory.
  it("matches the hand-calculated trajectory over 20 frames", () => {
    const map = blankMap();
    let arrow = flyingE(100, 100);
    // Piecewise: while vy unclamped (n ≤ 13), Δy = 0.3·n(n+1)/2;
    // once clamped at vy=4 (n ≥ 14), each subsequent frame adds 4.
    const expectedY = (n: number): number => {
      if (n <= 13) return (0.3 * n * (n + 1)) / 2;
      return 0.3 * 91 + 4 * (n - 13);
    };
    for (let f = 1; f <= 20; f++) {
      arrow = stepArrow(arrow, map);
      expect(arrow.status).toBe("flying");
      expect(arrow.age).toBe(f);
      expect(arrow.vel.x).toBeCloseTo(5, 12);
      expect(arrow.vel.y).toBeCloseTo(Math.min(0.3 * f, 4.0), 12);
      expect(arrow.pos.x).toBeCloseTo(100 + 5 * f, 12);
      expect(arrow.pos.y).toBeCloseTo(100 + expectedY(f), 12);
    }
  });
});

describe("stepArrow — wall impact", () => {
  // test-arena-walls has SOLID columns at x=0,16 and x=448,464 between
  // rows 10..15 (y ∈ [160, 256)). Fire an arrow horizontally toward the
  // right wall from a starting x just shy of impact, in a row that
  // overlaps the wall.
  it("impact on a SOLID column → status='embedded', vel zeroed", () => {
    // Row 11 (y=176..192). With vel.x=5: frame 1 → 435, frame 2 → 440
    // (right edge flush at x=448, "touching ≠ intersecting" rule keeps
    // it un-blocked); frame 3 → would cross into col 28, sweep clamps
    // back to x=440 and emits hit.
    let arrow = flyingE(430, 176);
    arrow = stepArrow(arrow, wallsMap);
    expect(arrow.status).toBe("flying");
    arrow = stepArrow(arrow, wallsMap);
    expect(arrow.status).toBe("flying");
    arrow = stepArrow(arrow, wallsMap);
    expect(arrow.status).toBe("embedded");
    expect(arrow.vel.x).toBe(0);
    expect(arrow.vel.y).toBe(0);
    expect(arrow.pos.x).toBe(440);
    // Pickup grace armed.
    expect(arrow.groundedTimer).toBe(ARROW_GROUNDED_PICKUP_DELAY);
  });
});

describe("stepArrow — wrap", () => {
  it("crosses the right seam and reappears on the left without spurious collision", () => {
    // Row 6 of test-arena-walls is fully empty in cols 0..29 — wrapping
    // through it must NOT trigger a collision (cols 0,1 and 28,29 only
    // hold SOLID at rows 10..15). Start at x=475 with horizontal vel=5.
    let arrow = flyingE(475, 100);
    arrow = stepArrow(arrow, wallsMap); // x: 475+5 = 480 → wraps to 0
    expect(arrow.status).toBe("flying");
    expect(arrow.pos.x).toBe(0);
    arrow = stepArrow(arrow, wallsMap); // x: 0 + 5 = 5
    expect(arrow.status).toBe("flying");
    expect(arrow.pos.x).toBe(5);
  });
});

describe("stepArrow — SPIKE pass-through", () => {
  it("falls past a SPIKE tile without changing status", () => {
    // SPIKE in test-arena-walls is at (col 14, row 15) → y ∈ [240, 256).
    // Drop an arrow at (col 14, y=100) and let gravity carry it down.
    const arrow0: Arrow = {
      id: "spike-test",
      type: "normal",
      pos: { x: 14 * 16, y: 100 },
      vel: { x: 0, y: 0 },
      ownerId: "shooter",
      status: "flying",
      age: 0,
      groundedTimer: 0,
    };
    let arrow = arrow0;
    let crossedSpike = false;
    // Step until landing on the floor (row 16, y=256) → status grounded.
    for (let i = 0; i < 200 && arrow.status === "flying"; i++) {
      arrow = stepArrow(arrow, wallsMap);
      // Track when the arrow's body straddles the spike row.
      if (arrow.pos.y >= 238 && arrow.pos.y <= 256) crossedSpike = true;
      expect(arrow.status === "flying" || arrow.status === "grounded").toBe(true);
    }
    expect(crossedSpike).toBe(true);
    // Eventually lands on the floor.
    expect(arrow.status).toBe("grounded");
  });
});

describe("stepArrow — grounded/embedded inertia", () => {
  it("does not move once grounded; groundedTimer counts down to 0", () => {
    const grounded: Arrow = {
      id: "g",
      type: "normal",
      pos: { x: 100, y: 100 },
      vel: { x: 0, y: 0 },
      ownerId: "x",
      status: "grounded",
      age: 50,
      groundedTimer: ARROW_GROUNDED_PICKUP_DELAY,
    };
    const map = blankMap();
    let a = grounded;
    for (let i = 0; i < ARROW_GROUNDED_PICKUP_DELAY; i++) {
      a = stepArrow(a, map);
      expect(a.pos.x).toBe(100);
      expect(a.pos.y).toBe(100);
      expect(a.status).toBe("grounded");
    }
    expect(a.groundedTimer).toBe(0);
    expect(a.age).toBe(50 + ARROW_GROUNDED_PICKUP_DELAY);
  });
});

describe("stepArrow — ARENA_WIDTH_PX wrap invariant", () => {
  it("position.x is always in [0, ARENA_WIDTH_PX)", () => {
    const map = blankMap();
    let arrow = flyingE(0, 50);
    for (let i = 0; i < 200; i++) {
      arrow = stepArrow(arrow, map);
      expect(arrow.pos.x).toBeGreaterThanOrEqual(0);
      expect(arrow.pos.x).toBeLessThan(ARENA_WIDTH_PX);
    }
  });
});

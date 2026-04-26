import {
  ARROW_GROUNDED_PICKUP_DELAY,
  DRILL_ARROW_SPEED,
  DRILL_MAX_PIERCES,
  type MapJson,
} from "@arrowfall/shared";
import { describe, expect, it } from "vitest";
import { parseMap } from "../tilemap/loader.js";
import { stepArrow } from "./step.js";
import { type Arrow } from "./types.js";

// Map for the drill test:
//   - Single SOLID tile at col 10 row 5 (the "pierceable" wall).
//   - Vertical SOLID wall at col 14, rows 1..15 (the "embed" wall).
//   - Floor at row 16.
// A drill fired east at y=82 starts in row 5 and falls under gravity
// as it travels. Even after dropping a few rows it will still hit the
// vertical col-14 wall — guaranteeing a deterministic embed regardless
// of the exact ballistic curve.
const drillMapJson: MapJson = {
  id: "drill-test",
  name: "drill-test",
  width: 30,
  height: 17,
  rows: [
    "..............................", // 0
    "..............#...............", // 1
    "..............#...............", // 2
    "..............#...............", // 3
    "..............#...............", // 4
    "..........#...#...............", // 5  ← pierceable + wall
    "..............#...............", // 6
    "..............#...............", // 7
    "..............#...............", // 8
    "..............#...............", // 9
    "..............#...............", // 10
    "..............#...............", // 11
    "..............#...............", // 12
    "..............#...............", // 13
    "..............#...............", // 14
    "..............#...............", // 15
    "##############################", // 16
  ],
};

const map = parseMap(drillMapJson);

const drillFlying = (x: number, y: number, vx: number = DRILL_ARROW_SPEED): Arrow => ({
  id: "test-drill",
  type: "drill",
  pos: { x, y },
  vel: { x: vx, y: 0 },
  ownerId: "p1",
  status: "flying",
  age: 0,
  groundedTimer: 0,
  piercesUsed: 0,
  bouncesUsed: 0,
});

describe("drill arrow — pierce one SOLID then embed on the next", () => {
  it("DRILL_MAX_PIERCES is 1 (Phase 9b spec)", () => {
    expect(DRILL_MAX_PIERCES).toBe(1);
  });

  it("passes through col 10 (piercesUsed bumps to 1) and embeds in col 14", () => {
    let arrow = drillFlying(130, 82);
    let piercedAt: number | null = null;
    let embeddedAt: number | null = null;

    for (let f = 1; f <= 60 && embeddedAt === null; f++) {
      const before = arrow;
      arrow = stepArrow(arrow, map);
      if (
        piercedAt === null &&
        arrow.piercesUsed === 1 &&
        before.piercesUsed === 0
      ) {
        piercedAt = f;
        // Pierce frame keeps the arrow flying; vel.x preserved.
        expect(arrow.status).toBe("flying");
        expect(arrow.vel.x).toBe(DRILL_ARROW_SPEED);
      }
      if (arrow.status === "embedded" || arrow.status === "grounded") {
        embeddedAt = f;
      }
    }
    expect(piercedAt).not.toBeNull();
    expect(embeddedAt).not.toBeNull();
    expect(piercedAt!).toBeLessThan(embeddedAt!);
    // Drill embeds (not grounds) — the col-14 wall is a vertical wall,
    // not a floor. (If gravity dragged the arrow all the way to row 16
    // before the wall, the test setup is broken.)
    expect(arrow.status).toBe("embedded");
    expect(arrow.piercesUsed).toBe(1);
    expect(arrow.vel.x).toBe(0);
    expect(arrow.groundedTimer).toBe(ARROW_GROUNDED_PICKUP_DELAY);
  });

  it("a normal arrow on the same trajectory embeds at col 10 instead of piercing", () => {
    // Sanity — proves the pierce behaviour is drill-specific, not a
    // shared ARROW_PROFILES quirk.
    const normal: Arrow = { ...drillFlying(130, 82, 5), type: "normal" };
    let arrow = normal;
    while (arrow.status === "flying") arrow = stepArrow(arrow, map);
    expect(arrow.status).toBe("embedded");
    expect(arrow.piercesUsed).toBe(0); // never bumped (irrelevant for normals)
    // Must have stopped at the FIRST wall — col 10 east edge at x=160.
    // Sweep clamps right edge to x=160 → pos.x = 160 - ARROW_W = 152.
    expect(arrow.pos.x).toBe(152);
  });

  it("piercesUsed never exceeds DRILL_MAX_PIERCES across a long flight", () => {
    let arrow = drillFlying(130, 82);
    for (let f = 0; f < 60 && arrow.status === "flying"; f++) {
      arrow = stepArrow(arrow, map);
      expect(arrow.piercesUsed).toBeLessThanOrEqual(DRILL_MAX_PIERCES);
    }
  });
});

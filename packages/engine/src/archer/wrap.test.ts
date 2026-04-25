import { describe, expect, it } from "vitest";
import {
  ARENA_HEIGHT_PX,
  ARENA_WIDTH_PX,
  type MapData,
  type MapJson,
  NEUTRAL_INPUT,
} from "@arrowfall/shared";
import { parseMap } from "../tilemap/loader.js";
import { stepArcher } from "./step.js";
import { createArcher } from "./types.js";

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

describe("stepArcher — wrap (spec §5.2)", () => {
  it("wraps horizontally when crossing the right seam", () => {
    const map = blankMap();
    // Body 2 px from the right edge with positive horizontal velocity.
    let a = createArcher("x", { x: ARENA_WIDTH_PX - 2, y: 100 });
    a = { ...a, vel: { x: 5, y: 0 } };
    a = stepArcher(a, NEUTRAL_INPUT, map);
    // After: in-air friction shaves 0.1 off vx (5 - 0.1 = 4.9), so the
    // body advances by 4.9 px, lands at 482.9, wraps to 2.9.
    expect(a.pos.x).toBeCloseTo(2.9, 9);
    expect(a.pos.x).toBeGreaterThanOrEqual(0);
    expect(a.pos.x).toBeLessThan(ARENA_WIDTH_PX);
  });

  it("wraps vertically when crossing the bottom seam", () => {
    const map = blankMap();
    let a = createArcher("x", { x: 100, y: ARENA_HEIGHT_PX - 2 });
    // Already at MAX_FALL_SPEED-ish; gravity will clamp the next vy to 4.
    a = { ...a, vel: { x: 0, y: 5 } };
    a = stepArcher(a, NEUTRAL_INPUT, map);
    expect(a.pos.y).toBeCloseTo(2, 9);
    expect(a.pos.y).toBeGreaterThanOrEqual(0);
    expect(a.pos.y).toBeLessThan(ARENA_HEIGHT_PX);
  });
});

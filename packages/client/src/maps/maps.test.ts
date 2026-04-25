import { parseMap } from "@arrowfall/engine";
import { type MapJson } from "@arrowfall/shared";
import { describe, expect, it } from "vitest";
import arena01 from "./arena-01.json" with { type: "json" };
import arena02 from "./arena-02.json" with { type: "json" };

// Maps are parsed at runtime in the Game constructor, so a malformed
// fixture would only blow up in the browser. These tests give early
// signal at CI time. Spawn counts are load-bearing for hot-seat: the
// Game class picks the map by PLAYER_COUNT.
describe("map fixtures", () => {
  it("arena-01 parses cleanly with the 2 expected spawns", () => {
    const m = parseMap(arena01 as MapJson);
    expect(m.id).toBe("arena-01");
    expect(m.spawns).toHaveLength(2);
  });

  it("arena-02 parses cleanly with 4 spawns spread across quadrants", () => {
    const m = parseMap(arena02 as MapJson);
    expect(m.id).toBe("arena-02");
    expect(m.spawns).toHaveLength(4);

    // One spawn per quadrant: split (cx=15, cy=8) inside the 30×17 grid.
    const cx = 15;
    const cy = 8;
    const buckets = { tl: 0, tr: 0, bl: 0, br: 0 };
    for (const s of m.spawns) {
      const left = s.x < cx;
      const top = s.y < cy;
      if (left && top) buckets.tl += 1;
      else if (!left && top) buckets.tr += 1;
      else if (left && !top) buckets.bl += 1;
      else buckets.br += 1;
    }
    expect(buckets).toEqual({ tl: 1, tr: 1, bl: 1, br: 1 });
  });
});

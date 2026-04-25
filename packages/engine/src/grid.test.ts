import { describe, expect, it } from "vitest";
import { ARENA_HEIGHT_PX, ARENA_WIDTH_PX, TILE_SIZE, type MapJson } from "@arrowfall/shared";
import { tileAt, tileToWorld, worldToTile, wrapPosition } from "./tilemap/grid.js";
import { parseMap } from "./tilemap/loader.js";

const blankFixture: MapJson = {
  id: "blank",
  name: "Blank",
  width: 30,
  height: 17,
  rows: Array.from({ length: 17 }, () => ".".repeat(30)),
};

describe("worldToTile / tileToWorld", () => {
  it("tileToWorld returns the centre of the tile", () => {
    expect(tileToWorld(0, 0)).toEqual({ x: 8, y: 8 });
    expect(tileToWorld(5, 7)).toEqual({ x: 5 * TILE_SIZE + 8, y: 7 * TILE_SIZE + 8 });
  });

  it("worldToTile is the floor-div inverse of tileToWorld for the centre", () => {
    for (let tx = 0; tx < 30; tx++) {
      for (let ty = 0; ty < 17; ty++) {
        const c = tileToWorld(tx, ty);
        expect(worldToTile(c.x, c.y)).toEqual({ x: tx, y: ty });
      }
    }
  });

  it("worldToTile floors negatives correctly (Math.floor, not trunc)", () => {
    expect(worldToTile(-1, -1)).toEqual({ x: -1, y: -1 });
    expect(worldToTile(-TILE_SIZE, -TILE_SIZE)).toEqual({ x: -1, y: -1 });
    expect(worldToTile(-TILE_SIZE - 1, -TILE_SIZE - 1)).toEqual({ x: -2, y: -2 });
  });
});

describe("wrapPosition (spec §5.2)", () => {
  it("identity inside the framebuffer", () => {
    expect(wrapPosition({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    expect(wrapPosition({ x: 100, y: 50 })).toEqual({ x: 100, y: 50 });
    expect(wrapPosition({ x: ARENA_WIDTH_PX - 1, y: ARENA_HEIGHT_PX - 1 })).toEqual({
      x: ARENA_WIDTH_PX - 1,
      y: ARENA_HEIGHT_PX - 1,
    });
  });

  it("right edge wraps to 0", () => {
    expect(wrapPosition({ x: ARENA_WIDTH_PX, y: 50 })).toEqual({ x: 0, y: 50 });
    expect(wrapPosition({ x: ARENA_WIDTH_PX + 5, y: 50 })).toEqual({ x: 5, y: 50 });
  });

  it("bottom edge wraps to 0", () => {
    expect(wrapPosition({ x: 50, y: ARENA_HEIGHT_PX })).toEqual({ x: 50, y: 0 });
    expect(wrapPosition({ x: 50, y: ARENA_HEIGHT_PX + 7 })).toEqual({ x: 50, y: 7 });
  });

  it("negatives wrap to the opposite edge", () => {
    expect(wrapPosition({ x: -1, y: 50 })).toEqual({ x: ARENA_WIDTH_PX - 1, y: 50 });
    expect(wrapPosition({ x: 50, y: -1 })).toEqual({ x: 50, y: ARENA_HEIGHT_PX - 1 });
  });

  it("all 4 corners wrap simultaneously", () => {
    expect(wrapPosition({ x: -1, y: -1 })).toEqual({
      x: ARENA_WIDTH_PX - 1,
      y: ARENA_HEIGHT_PX - 1,
    });
    expect(wrapPosition({ x: ARENA_WIDTH_PX, y: ARENA_HEIGHT_PX })).toEqual({ x: 0, y: 0 });
    expect(wrapPosition({ x: ARENA_WIDTH_PX + 7, y: ARENA_HEIGHT_PX + 3 })).toEqual({
      x: 7,
      y: 3,
    });
    expect(wrapPosition({ x: -ARENA_WIDTH_PX - 1, y: -ARENA_HEIGHT_PX - 1 })).toEqual({
      x: ARENA_WIDTH_PX - 1,
      y: ARENA_HEIGHT_PX - 1,
    });
  });
});

describe("tileAt with wrap", () => {
  // Place a SOLID at tile (5, 5) and probe via positive, negative, and overflowing coords.
  const rows = blankFixture.rows.slice();
  rows[5] = ".".repeat(5) + "#" + ".".repeat(24);
  const map = parseMap({ ...blankFixture, rows });

  it("returns the cell at integer tile coords", () => {
    expect(tileAt(map, 5, 5)).toBe("SOLID");
    expect(tileAt(map, 0, 0)).toBe("EMPTY");
    expect(tileAt(map, 4, 5)).toBe("EMPTY");
  });

  it("wraps negative tile coords (-25 mod 30 = 5; -12 mod 17 = 5)", () => {
    expect(tileAt(map, -25, -12)).toBe("SOLID");
    expect(tileAt(map, -1, 0)).toBe("EMPTY");
  });

  it("wraps coords past the grid (35 mod 30 = 5; 22 mod 17 = 5)", () => {
    expect(tileAt(map, 35, 22)).toBe("SOLID");
  });

  it("truncates fractional tile coords before wrap", () => {
    expect(tileAt(map, 5.7, 5.2)).toBe("SOLID");
  });
});

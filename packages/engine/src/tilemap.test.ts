import { describe, expect, it } from "vitest";
import { type MapJson } from "@arrowfall/shared";
import { MapParseError, parseMap, serializeMap } from "./tilemap/loader.js";
import testArenaJson from "./__fixtures__/maps/test-arena.json" with { type: "json" };

const testArena = testArenaJson as MapJson;

const blankRow = ".".repeat(30);
const blankFixture: MapJson = {
  id: "blank",
  name: "Blank",
  width: 30,
  height: 17,
  rows: Array.from({ length: 17 }, () => blankRow),
};

const withRow = (rows: ReadonlyArray<string>, y: number, replacement: string): string[] => {
  const copy = rows.slice();
  copy[y] = replacement;
  return copy;
};

describe("parseMap", () => {
  it("accepts the test-arena fixture and derives spawn lists", () => {
    const json = testArena;
    const map = parseMap(json);
    expect(map.id).toBe("test-arena");
    expect(map.name).toBe("Test Arena");
    expect(map.tiles).toHaveLength(17);
    expect(map.tiles[0]).toHaveLength(30);
    expect(map.spawns).toHaveLength(4);
    expect(map.chestSpawns).toHaveLength(2);
    // Spawn coords are *tile* coordinates — sanity-check one against the fixture.
    expect(map.spawns).toContainEqual({ x: 2, y: 1 });
    expect(map.spawns).toContainEqual({ x: 27, y: 14 });
    expect(map.chestSpawns).toContainEqual({ x: 10, y: 11 });
  });

  it("rejects a wrong-width row with the row index in the message", () => {
    const bad: MapJson = { ...blankFixture, rows: withRow(blankFixture.rows, 0, "..short") };
    expect(() => parseMap(bad)).toThrow(MapParseError);
    expect(() => parseMap(bad)).toThrow(/row 0/);
    expect(() => parseMap(bad)).toThrow(/expected 30 chars/);
  });

  it("rejects an unknown tile char with row/col coordinates", () => {
    const broken = "..@" + ".".repeat(27);
    const bad: MapJson = { ...blankFixture, rows: withRow(blankFixture.rows, 3, broken) };
    expect(() => parseMap(bad)).toThrow(/row 3, col 2/);
    expect(() => parseMap(bad)).toThrow(/unknown tile char "@"/);
  });

  it("rejects a row count mismatch", () => {
    const bad: MapJson = { ...blankFixture, rows: blankFixture.rows.slice(0, 5) };
    expect(() => parseMap(bad)).toThrow(/rows.length/);
  });

  it("rejects metadata that doesn't match the spec arena size", () => {
    const bad = { ...blankFixture, width: 28 } as unknown as MapJson;
    expect(() => parseMap(bad)).toThrow(MapParseError);
    expect(() => parseMap(bad)).toThrow(/width must be 30/);
  });
});

describe("serializeMap", () => {
  it("round-trips parseMap on the test-arena fixture", () => {
    const json = testArena;
    expect(serializeMap(parseMap(json))).toEqual(json);
  });

  it("round-trips a synthesised map with all tile kinds", () => {
    const rows = withRow(blankFixture.rows, 5, "#-^PC" + ".".repeat(25));
    const json: MapJson = { ...blankFixture, rows };
    expect(serializeMap(parseMap(json))).toEqual(json);
  });
});

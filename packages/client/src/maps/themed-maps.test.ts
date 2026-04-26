// Phase 10 — sanity checks on the three new themed maps. Verifies
// each parses, declares the right theme, and offers playable spawn
// + chest counts.

import { describe, expect, it } from "vitest";
import { parseMap } from "@arrowfall/engine";
import type { MapJson } from "@arrowfall/shared";
import sacredGrove from "./sacred-grove.json" with { type: "json" };
import twinSpires from "./twin-spires.json" with { type: "json" };
import oldTemple from "./old-temple.json" with { type: "json" };

const FIXTURES: ReadonlyArray<{ json: MapJson; theme: string; minSpawns: number; minChests: number }> = [
  { json: sacredGrove as MapJson, theme: "sacred-grove", minSpawns: 4, minChests: 2 },
  { json: twinSpires as MapJson, theme: "twin-spires", minSpawns: 4, minChests: 3 },
  { json: oldTemple as MapJson, theme: "old-temple", minSpawns: 4, minChests: 2 },
];

describe.each(FIXTURES)(
  "themed map: $theme",
  ({ json, theme, minSpawns, minChests }) => {
    const map = parseMap(json);

    it("matches its declared theme", () => {
      expect(map.theme).toBe(theme);
    });

    it(`has at least ${minSpawns} spawn points`, () => {
      expect(map.spawns.length).toBeGreaterThanOrEqual(minSpawns);
    });

    it(`has at least ${minChests} chest spawns`, () => {
      expect(map.chestSpawns.length).toBeGreaterThanOrEqual(minChests);
    });

    it("matches the canonical 30 × 17 size", () => {
      expect(map.width).toBe(30);
      expect(map.height).toBe(17);
      expect(map.tiles.length).toBe(17);
      for (const row of map.tiles) {
        expect(row.length).toBe(30);
      }
    });

    it("declares a unique map id", () => {
      expect(map.id).toBe(theme);
    });
  },
);

describe("legacy arena maps default to sacred-grove theme", () => {
  it("arena-01 retro-compat", async () => {
    const arena01 = (await import("./arena-01.json", { with: { type: "json" } })) as { default: MapJson };
    const m = parseMap(arena01.default);
    expect(m.theme).toBe("sacred-grove");
  });
});

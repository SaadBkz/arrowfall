// Phase 10 iter-2 — sanity tests for the decoration spawner. Confirms
// determinism + theme-correct kinds + idol placement on each map.

import { describe, expect, it } from "vitest";
import { parseMap } from "@arrowfall/engine";
import type { MapJson } from "@arrowfall/shared";
import sacredGrove from "../maps/sacred-grove.json" with { type: "json" };
import twinSpires from "../maps/twin-spires.json" with { type: "json" };
import oldTemple from "../maps/old-temple.json" with { type: "json" };
import { spawnDecorations } from "./decoration-spawner.js";

describe("spawnDecorations", () => {
  for (const [name, themePrefix, json] of [
    ["sacred-grove", "sg_", sacredGrove],
    ["twin-spires", "ts_", twinSpires],
    ["old-temple", "ot_", oldTemple],
  ] as const) {
    describe(name, () => {
      const map = parseMap(json as MapJson);
      const decos = spawnDecorations(map);

      it("places at least 6 decorations", () => {
        expect(decos.length).toBeGreaterThanOrEqual(6);
      });

      it("only emits theme-prefixed kinds", () => {
        for (const d of decos) {
          expect(d.kind.startsWith(themePrefix)).toBe(true);
        }
      });

      it("includes at least one large idol", () => {
        const idolKey = `${themePrefix}idol` as const;
        expect(decos.some((d) => d.kind === idolKey)).toBe(true);
      });

      it("is deterministic (two calls → identical output)", () => {
        const second = spawnDecorations(map);
        expect(second.length).toBe(decos.length);
        for (let i = 0; i < decos.length; i++) {
          expect(second[i]!.kind).toBe(decos[i]!.kind);
          expect(second[i]!.pos.x).toBe(decos[i]!.pos.x);
          expect(second[i]!.pos.y).toBe(decos[i]!.pos.y);
        }
      });

      it("positions are inside the play area or just outside (idols can hang past)", () => {
        for (const d of decos) {
          // Allow 8 px slack on each side for sprite anchors.
          expect(d.pos.x).toBeGreaterThanOrEqual(-8);
          expect(d.pos.y).toBeGreaterThanOrEqual(-8);
          expect(d.pos.x).toBeLessThanOrEqual(480 + 8);
          expect(d.pos.y).toBeLessThanOrEqual(270 + 8);
        }
      });
    });
  }
});

// Phase 10 — sanity checks on the palette data. The painters trust
// these, so a missing family or an invalid hex would crash the boot
// generator. Pure data — no DOM required.

import { describe, expect, it } from "vitest";
import { ALL_THEMES } from "@arrowfall/shared";
import {
  ALL_ARCHER_SKINS,
  ARCHER_SKINS,
  PALETTES,
  type ThemePalette,
} from "./palettes.js";

const HEX = /^#[0-9a-fA-F]{6}$/;

// Exclude `transparent` — that field is the literal 0 (alpha sentinel),
// not a Ramp tuple, and is checked separately below.
type RampFamily = Exclude<keyof ThemePalette, "transparent">;

const FAMILIES: ReadonlyArray<RampFamily> = [
  "stone",
  "accent",
  "wood",
  "sky",
  "metal",
  "fire",
  "text",
];

describe("PALETTES", () => {
  it("defines exactly the three themed palettes", () => {
    expect(Object.keys(PALETTES).sort()).toEqual([...ALL_THEMES].sort());
  });

  for (const theme of ALL_THEMES) {
    describe(theme, () => {
      const p = PALETTES[theme];

      it.each(FAMILIES)("family %s has 4 valid hex ramps", (fam) => {
        const ramp = p[fam];
        expect(ramp).toHaveLength(4);
        for (const c of ramp) {
          expect(c).toMatch(HEX);
        }
      });

      it("transparent slot is the literal 0", () => {
        expect(p.transparent).toBe(0);
      });
    });
  }
});

describe("ARCHER_SKINS", () => {
  it("defines exactly 6 visually distinct skins", () => {
    expect(ALL_ARCHER_SKINS).toHaveLength(6);
    expect(new Set(ALL_ARCHER_SKINS).size).toBe(6);
  });

  it("every skin has all required fields with valid hex", () => {
    for (const id of ALL_ARCHER_SKINS) {
      const skin = ARCHER_SKINS[id];
      expect(skin.body).toMatch(HEX);
      expect(skin.bodyShade).toMatch(HEX);
      expect(skin.bodyLight).toMatch(HEX);
      expect(skin.cape).toMatch(HEX);
      expect(skin.capeShade).toMatch(HEX);
      expect(skin.accent).toMatch(HEX);
      expect(skin.skin).toMatch(HEX);
      expect(skin.eye).toMatch(HEX);
      expect(skin.bow).toMatch(HEX);
    }
  });

  it("skins differ from each other on the body colour", () => {
    const bodies = ALL_ARCHER_SKINS.map((id) => ARCHER_SKINS[id].body);
    expect(new Set(bodies).size).toBe(6);
  });
});

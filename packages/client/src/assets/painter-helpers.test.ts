// Phase 10 — pure helper tests. The painter functions themselves
// require a DOM canvas (skipped in vitest's default node env), but
// every routing function (frame picker, dir mapper, deterministic seed)
// is testable here.

import { describe, expect, it } from "vitest";
import { mulberry32, tileSeed } from "./canvas.js";
import { aimDirOf } from "./archer-painter.js";
import { flyingFrameFor } from "./arrow-painter.js";
import { chestFrameFor, CHEST_FRAME_COUNT } from "./chest-painter.js";
import { variantKeyFor } from "./tile-painter.js";

describe("mulberry32", () => {
  it("is deterministic across two streams from the same seed", () => {
    const a = mulberry32(0xdead_beef);
    const b = mulberry32(0xdead_beef);
    for (let i = 0; i < 32; i++) {
      expect(a()).toBe(b());
    }
  });

  it("yields values in [0, 1)", () => {
    const r = mulberry32(0xfeed);
    for (let i = 0; i < 64; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("tileSeed", () => {
  it("returns the same seed for the same coords", () => {
    expect(tileSeed("sacred-grove", 4, 7)).toBe(tileSeed("sacred-grove", 4, 7));
  });

  it("differs across themes for the same coords", () => {
    const a = tileSeed("sacred-grove", 4, 7);
    const b = tileSeed("twin-spires", 4, 7);
    expect(a).not.toBe(b);
  });

  it("differs across coords for the same theme", () => {
    const a = tileSeed("sacred-grove", 4, 7);
    const b = tileSeed("sacred-grove", 5, 7);
    expect(a).not.toBe(b);
  });
});

describe("variantKeyFor", () => {
  it("returns null for non-render tile kinds", () => {
    expect(variantKeyFor("sacred-grove", "EMPTY", 0, 0)).toBeNull();
    expect(variantKeyFor("sacred-grove", "SPAWN", 0, 0)).toBeNull();
    expect(variantKeyFor("sacred-grove", "CHEST_SPAWN", 0, 0)).toBeNull();
  });

  it("returns SOLID_0..3 for SOLID tiles", () => {
    const key = variantKeyFor("sacred-grove", "SOLID", 4, 7);
    expect(key).toMatch(/^SOLID_[0-3]$/);
  });

  it("is deterministic for the same coords", () => {
    const a = variantKeyFor("sacred-grove", "SOLID", 4, 7);
    const b = variantKeyFor("sacred-grove", "SOLID", 4, 7);
    expect(a).toBe(b);
  });

  it("returns the static keys for JUMPTHRU and SPIKE", () => {
    expect(variantKeyFor("twin-spires", "JUMPTHRU", 0, 0)).toBe("JUMPTHRU");
    expect(variantKeyFor("twin-spires", "SPIKE", 0, 0)).toBe("SPIKE");
  });
});

describe("aimDirOf", () => {
  it("falls back to facing when no aim input", () => {
    expect(aimDirOf(null, null, "R")).toBe("E");
    expect(aimDirOf(null, null, "L")).toBe("W");
  });

  it("maps cardinals", () => {
    expect(aimDirOf(0, -1, "R")).toBe("N");
    expect(aimDirOf(0, 1, "R")).toBe("S");
    expect(aimDirOf(1, 0, "R")).toBe("E");
    expect(aimDirOf(-1, 0, "R")).toBe("W");
  });

  it("maps diagonals", () => {
    expect(aimDirOf(1, -1, "R")).toBe("NE");
    expect(aimDirOf(1, 1, "R")).toBe("SE");
    expect(aimDirOf(-1, -1, "R")).toBe("NW");
    expect(aimDirOf(-1, 1, "R")).toBe("SW");
  });
});

describe("flyingFrameFor", () => {
  it("normal arrows always use frame 0", () => {
    expect(flyingFrameFor("normal", 0)).toBe("normal_flying_0");
    expect(flyingFrameFor("normal", 100)).toBe("normal_flying_0");
  });

  it("bomb cycles through 4 frames over 16 ticks", () => {
    expect(flyingFrameFor("bomb", 0)).toBe("bomb_flying_0");
    expect(flyingFrameFor("bomb", 4)).toBe("bomb_flying_1");
    expect(flyingFrameFor("bomb", 8)).toBe("bomb_flying_2");
    expect(flyingFrameFor("bomb", 12)).toBe("bomb_flying_3");
    expect(flyingFrameFor("bomb", 16)).toBe("bomb_flying_0");
  });

  it("drill cycles through 4 frames over 12 ticks", () => {
    expect(flyingFrameFor("drill", 0)).toBe("drill_flying_0");
    expect(flyingFrameFor("drill", 3)).toBe("drill_flying_1");
    expect(flyingFrameFor("drill", 12)).toBe("drill_flying_0");
  });

  it("laser cycles 2 frames every 2 ticks", () => {
    expect(flyingFrameFor("laser", 0)).toBe("laser_flying_0");
    expect(flyingFrameFor("laser", 2)).toBe("laser_flying_1");
    expect(flyingFrameFor("laser", 4)).toBe("laser_flying_0");
  });
});

describe("chestFrameFor", () => {
  it("closed → frame 0", () => {
    expect(chestFrameFor("closed", 30, 30)).toBe(0);
  });

  it("opened → last frame", () => {
    expect(chestFrameFor("opened", 0, 30)).toBe(CHEST_FRAME_COUNT - 1);
  });

  it("opening ramps frame 0 → max as timer counts down", () => {
    expect(chestFrameFor("opening", 30, 30)).toBe(0); // just triggered
    expect(chestFrameFor("opening", 15, 30)).toBe(3); // halfway
    expect(chestFrameFor("opening", 0, 30)).toBe(CHEST_FRAME_COUNT - 1);
  });

  it("clamps within frame range when openTimer overshoots", () => {
    expect(chestFrameFor("opening", -10, 30)).toBe(CHEST_FRAME_COUNT - 1);
    expect(chestFrameFor("opening", 100, 30)).toBe(0);
  });
});

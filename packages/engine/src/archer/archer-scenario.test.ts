import { describe, expect, it } from "vitest";
import {
  type ArcherInput,
  type MapJson,
  ARENA_WIDTH_PX,
  NEUTRAL_INPUT,
} from "@arrowfall/shared";
import { parseMap } from "../tilemap/loader.js";
import testArenaWallsJson from "../__fixtures__/maps/test-arena-walls.json" with { type: "json" };
import { stepArcher } from "./step.js";
import { type Archer, createArcher } from "./types.js";

const map = parseMap(testArenaWallsJson as MapJson);

// Spec §0 — spawn coords match the fixture's "P" tile at (col 2, row 1).
const SPAWN = { x: 2 * 16, y: 1 * 16 };

const FRAMES = 600;

// Input script over 600 frames, spelled out as a switch on the frame
// number. Edges (jump, dodge) only fire on a single frame; levels
// (left, right, etc.) hold across ranges.
//
// Coverage:
//   - walk           : right=true ranges
//   - jump           : edge frames 100, 220, 320
//   - aerial walk    : right held during in-air ranges
//   - fall           : NEUTRAL phases, gravity drives the body
//   - horizontal dodge: dodge=true while right held (frame 130)
//   - aerial dodge   : dodge=true after jump while still ascending (frame 230)
//   - wall-jump      : jump pressed while right wall flush (frame 320 area)
//
// Wrap traversal is exercised by a dedicated wrap.test.ts since
// reaching the seam from the spawn within 600 frames would require
// chaining wall-jumps and the input choreography is brittle.
const inputAt = (f: number): ArcherInput => {
  const right =
    (f >= 70 && f < 100) ||
    (f >= 101 && f < 130) ||
    (f >= 131 && f < 200) ||
    (f >= 220 && f < 320) ||
    (f >= 321 && f < 450);
  const left = f >= 460 && f < 560;
  const up = false;
  const down = false;
  const jump = f === 100 || f === 220 || f === 320;
  const dodge = f === 130 || f === 230;
  const jumpHeld = false;
  return { left, right, up, down, jump, dodge, jumpHeld };
};

const runScenario = (frames: number): Archer[] => {
  let a = createArcher("scenario", SPAWN);
  const trace: Archer[] = [a];
  for (let f = 0; f < frames; f++) {
    a = stepArcher(a, inputAt(f), map);
    trace.push(a);
  }
  return trace;
};

describe("archer scenario — 600 frames, deterministic", () => {
  it("two parallel runs are bit-identical at every frame (tolerance 0)", () => {
    const traceA = runScenario(FRAMES);
    const traceB = runScenario(FRAMES);
    expect(traceA).toHaveLength(FRAMES + 1);
    expect(traceB).toHaveLength(FRAMES + 1);
    for (let f = 0; f <= FRAMES; f++) {
      const a = traceA[f]!;
      const b = traceB[f]!;
      // Strict equality on all numerical state (pos, vel) — no tolerance.
      expect(a.pos.x).toBe(b.pos.x);
      expect(a.pos.y).toBe(b.pos.y);
      expect(a.vel.x).toBe(b.vel.x);
      expect(a.vel.y).toBe(b.vel.y);
      expect(a.state).toBe(b.state);
      expect(a.facing).toBe(b.facing);
    }
  });

  it("hand-calculated jalon: 10 NEUTRAL frames from spawn → free-fall", () => {
    // Spawn is in mid-air (row 1, no platform under col 2 until row 16
    // floor far below — and that floor only exists in test-arena-walls
    // outside the spawn column anyway). With NEUTRAL_INPUT, vy
    // accumulates GRAVITY each frame (semi-implicit Euler):
    //   vy(n) = 0.3 · n
    //   y(n)  = y0 + 0.3 · n(n+1)/2
    let a = createArcher("jalon", SPAWN);
    for (let i = 0; i < 10; i++) a = stepArcher(a, NEUTRAL_INPUT, map);
    expect(a.vel.x).toBe(0);
    expect(a.vel.y).toBeCloseTo(3.0, 9);
    expect(a.pos.y).toBeCloseTo(SPAWN.y + 0.3 * (10 * 11) / 2, 9);
    expect(a.pos.x).toBe(SPAWN.x);
  });

  it("position stays inside the wrapped framebuffer at every frame", () => {
    const trace = runScenario(FRAMES);
    for (const a of trace) {
      expect(a.pos.x).toBeGreaterThanOrEqual(0);
      expect(a.pos.x).toBeLessThan(ARENA_WIDTH_PX);
    }
  });
});

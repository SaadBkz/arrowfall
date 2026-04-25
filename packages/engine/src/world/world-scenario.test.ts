import { describe, expect, it } from "vitest";
import {
  ARENA_WIDTH_PX,
  ARROW_SPEED,
  type ArcherInput,
  type MapJson,
  NEUTRAL_INPUT,
  TILE_SIZE,
} from "@arrowfall/shared";
import testArenaWallsJson from "../__fixtures__/maps/test-arena-walls.json" with { type: "json" };
import { parseMap } from "../tilemap/loader.js";
import { createWorld } from "./create.js";
import { stepWorld } from "./step.js";
import { type World, type WorldEvent } from "./types.js";
import { type Archer } from "../archer/types.js";
import { type Arrow } from "../arrow/types.js";

const map = parseMap(testArenaWallsJson as MapJson);
// SPAWN tiles at (col 2, row 1) and (col 27, row 1) → pixel coords.
const SPAWN_POINTS = map.spawns.map((s) => ({
  x: s.x * TILE_SIZE,
  y: s.y * TILE_SIZE,
}));

const FRAMES = 600;
const IDS = ["p1", "p2"] as const;

// Per-archer input script. Designed to exercise:
//   - free-fall under spawn iframes (frames 0..60)
//   - landing on the floor row (around frame 63)
//   - walking toward each other (after landing)
//   - shooting horizontally — arrows fly across the arena and wrap
//     around the seam (no walls at row 11 jumpthru row, so trajectories
//     don't always hit the opposing wall — exercises both wrap and
//     wall-impact paths over 600 frames)
//   - jumping and dodging at scripted moments
//   - shooting during a dodge to test the cooldown re-arm
//
// The script is purely a function of (id, frame): there is no shared
// mutable state, so two parallel runs MUST agree.
const inputAt = (id: string, f: number): ArcherInput => {
  if (id === "p1") {
    // p1 walks right after landing, shoots periodically, dodges & jumps.
    const right = f >= 80 && f < 400;
    const left = f >= 470 && f < 540;
    const jump = f === 200 || f === 350;
    const dodge = f === 250 || f === 480;
    const shoot = f === 100 || f === 150 || f === 300 || f === 252 || f === 500;
    return {
      ...NEUTRAL_INPUT,
      right,
      left,
      jump,
      dodge,
      shoot,
      aimDirection: shoot ? "E" : null,
    };
  }
  // p2 walks left after landing, shoots periodically, dodges occasionally.
  const left = f >= 80 && f < 380;
  const right = f >= 460 && f < 530;
  const jump = f === 220 || f === 370;
  const dodge = f === 260 || f === 490;
  const shoot = f === 120 || f === 170 || f === 320 || f === 510;
  return {
    ...NEUTRAL_INPUT,
    left,
    right,
    jump,
    dodge,
    shoot,
    aimDirection: shoot ? "W" : null,
  };
};

const inputsForFrame = (f: number): Map<string, ArcherInput> => {
  const m = new Map<string, ArcherInput>();
  for (const id of IDS) m.set(id, inputAt(id, f));
  return m;
};

type Frame = {
  readonly tick: number;
  readonly archers: ReadonlyArray<Archer>;
  readonly arrows: ReadonlyArray<Arrow>;
  readonly events: ReadonlyArray<WorldEvent>;
};

const snapshot = (w: World): Frame => ({
  tick: w.tick,
  archers: [...w.archers.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, a]) => a),
  arrows: [...w.arrows].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  events: [...w.events],
});

const runScenario = (frames: number): Frame[] => {
  let w: World = createWorld(map, SPAWN_POINTS, [...IDS]);
  const trace: Frame[] = [snapshot(w)];
  for (let f = 0; f < frames; f++) {
    w = stepWorld(w, inputsForFrame(f));
    trace.push(snapshot(w));
  }
  return trace;
};

describe("stepWorld — 600-frame deterministic pivot", () => {
  it("two parallel runs are bit-identical at every frame (tolerance 0)", () => {
    const a = runScenario(FRAMES);
    const b = runScenario(FRAMES);
    expect(a).toHaveLength(FRAMES + 1);
    expect(b).toHaveLength(FRAMES + 1);

    for (let f = 0; f <= FRAMES; f++) {
      const fa = a[f]!;
      const fb = b[f]!;
      expect(fa.tick).toBe(fb.tick);
      // Archers: positions, velocities, inventory, alive, all timers.
      expect(fa.archers.length).toBe(fb.archers.length);
      for (let i = 0; i < fa.archers.length; i++) {
        const aa = fa.archers[i]!;
        const ab = fb.archers[i]!;
        expect(aa.id).toBe(ab.id);
        expect(aa.pos.x).toBe(ab.pos.x);
        expect(aa.pos.y).toBe(ab.pos.y);
        expect(aa.vel.x).toBe(ab.vel.x);
        expect(aa.vel.y).toBe(ab.vel.y);
        expect(aa.inventory).toBe(ab.inventory);
        expect(aa.alive).toBe(ab.alive);
        expect(aa.shootCooldownTimer).toBe(ab.shootCooldownTimer);
        expect(aa.dodgeIframeTimer).toBe(ab.dodgeIframeTimer);
        expect(aa.spawnIframeTimer).toBe(ab.spawnIframeTimer);
        expect(aa.deathTimer).toBe(ab.deathTimer);
        expect(aa.state).toBe(ab.state);
      }
      // Arrows: same set, same physical state.
      expect(fa.arrows.length).toBe(fb.arrows.length);
      for (let i = 0; i < fa.arrows.length; i++) {
        const arA = fa.arrows[i]!;
        const arB = fb.arrows[i]!;
        expect(arA.id).toBe(arB.id);
        expect(arA.pos.x).toBe(arB.pos.x);
        expect(arA.pos.y).toBe(arB.pos.y);
        expect(arA.vel.x).toBe(arB.vel.x);
        expect(arA.vel.y).toBe(arB.vel.y);
        expect(arA.status).toBe(arB.status);
        expect(arA.groundedTimer).toBe(arB.groundedTimer);
        expect(arA.age).toBe(arB.age);
      }
      // Events: same kinds and ids, same order.
      expect(fa.events).toEqual(fb.events);
    }
  });

  it("hand-calculated jalon: p1 free-fall under spawn iframes (10 frames, no input)", () => {
    // p1 spawns at (32, 16). Spawn iframes active → archer is alive
    // and falls under gravity unimpeded (no input). After 10 NEUTRAL
    // frames: pos.y = 16 + 0.3·55 = 32.5, pos.x = 32, vel.y = 3.0.
    let w: World = createWorld(map, SPAWN_POINTS, [...IDS]);
    const inputs = new Map<string, ArcherInput>([
      ["p1", NEUTRAL_INPUT],
      ["p2", NEUTRAL_INPUT],
    ]);
    for (let i = 0; i < 10; i++) w = stepWorld(w, inputs);
    const p1 = w.archers.get("p1")!;
    expect(p1.pos.x).toBe(32);
    expect(p1.pos.y).toBeCloseTo(16 + (0.3 * 10 * 11) / 2, 9);
    expect(p1.vel.y).toBeCloseTo(3.0, 9);
    expect(p1.alive).toBe(true);
  });

  it("hand-calculated jalon: an arrow fired with aimDirection=E travels at ARROW_SPEED·n in x", () => {
    // Build a world with p1 at (200, 100) idle, iframes off, so a
    // single shoot fires cleanly with no terrain interference: the
    // arrow flies right through the open middle band of the arena
    // (rows 6..9 are entirely empty) for the 10-frame window.
    const baseWorld = createWorld(map, SPAWN_POINTS, [...IDS]);
    const p1Override = {
      ...baseWorld.archers.get("p1")!,
      pos: { x: 200, y: 100 },
      spawnIframeTimer: 0,
    };
    const archers = new Map(baseWorld.archers);
    archers.set("p1", p1Override);
    let w: World = { ...baseWorld, archers };

    const fire = new Map<string, ArcherInput>([
      ["p1", { ...NEUTRAL_INPUT, shoot: true, aimDirection: "E" }],
      ["p2", NEUTRAL_INPUT],
    ]);
    w = stepWorld(w, fire);
    const fired = w.events.find((e) => e.kind === "arrow-fired");
    expect(fired).toBeDefined();
    const arrowId = (fired as { arrowId: string }).arrowId;
    const arrow0 = w.arrows.find((a) => a.id === arrowId)!;
    expect(arrow0.vel.x).toBe(ARROW_SPEED);
    expect(arrow0.vel.y).toBe(0);
    const x0 = arrow0.pos.x;
    const y0 = arrow0.pos.y;

    const idle = new Map<string, ArcherInput>([
      ["p1", NEUTRAL_INPUT],
      ["p2", NEUTRAL_INPUT],
    ]);
    for (let i = 0; i < 10; i++) w = stepWorld(w, idle);
    const arrow10 = w.arrows.find((a) => a.id === arrowId)!;
    expect(arrow10.pos.x).toBeCloseTo(x0 + ARROW_SPEED * 10, 9);
    // y advanced by sum_{n=1..10} 0.3·n = 0.3·55 = 16.5.
    expect(arrow10.pos.y).toBeCloseTo(y0 + (0.3 * 10 * 11) / 2, 9);
    expect(arrow10.status).toBe("flying");
  });

  it("position invariants: every archer + arrow stays inside the wrapped framebuffer", () => {
    const trace = runScenario(FRAMES);
    for (const frame of trace) {
      for (const a of frame.archers) {
        expect(a.pos.x).toBeGreaterThanOrEqual(0);
        expect(a.pos.x).toBeLessThan(ARENA_WIDTH_PX);
      }
      for (const ar of frame.arrows) {
        expect(ar.pos.x).toBeGreaterThanOrEqual(0);
        expect(ar.pos.x).toBeLessThan(ARENA_WIDTH_PX);
      }
    }
  });
});

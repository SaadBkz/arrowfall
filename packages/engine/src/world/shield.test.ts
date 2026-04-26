import { describe, expect, it } from "vitest";
import {
  type ArcherInput,
  ARROW_SPEED,
  BOMB_RADIUS_PX,
  type MapData,
  type MapJson,
  NEUTRAL_INPUT,
  STOMP_BOUNCE_VELOCITY,
} from "@arrowfall/shared";
import { type Archer, createArcher } from "../archer/types.js";
import { type Arrow } from "../arrow/types.js";
import { parseMap } from "../tilemap/loader.js";
import { stepWorld } from "./step.js";
import { type World } from "./types.js";

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

const stableArcher = (id: string, x: number, y: number): Archer => ({
  ...createArcher(id, { x, y }, "R"),
  spawnIframeTimer: 0,
});

const shielded = (a: Archer): Archer => ({ ...a, hasShield: true });

const buildWorld = (
  archers: ReadonlyArray<Archer>,
  arrows: ReadonlyArray<Arrow> = [],
): World => {
  const map = blankMap();
  const m = new Map<string, Archer>();
  for (const a of archers) m.set(a.id, a);
  return { map, archers: m, arrows, chests: [], tick: 0, events: [] };
};

const neutralFor = (ids: ReadonlyArray<string>): Map<string, ArcherInput> => {
  const m = new Map<string, ArcherInput>();
  for (const id of ids) m.set(id, NEUTRAL_INPUT);
  return m;
};

const overlappingArrow = (
  ownerId: string,
  ax: number,
  ay: number,
): Arrow => ({
  id: "incoming",
  type: "normal",
  pos: { x: ax + 1, y: ay + 4 },
  vel: { x: ARROW_SPEED, y: 0 },
  ownerId,
  status: "flying",
  age: 0,
  groundedTimer: 0,
  piercesUsed: 0,
  bouncesUsed: 0,
});

describe("shield — arrow hit", () => {
  it("absorbs the lethal arrow: archer survives, hasShield=false, shield-broken emitted", () => {
    const victim = shielded(stableArcher("a", 100, 100));
    const shooter = stableArcher("b", 200, 100);
    const arrow = overlappingArrow("b", 100, 100);
    const w0 = buildWorld([victim, shooter], [arrow]);
    const w1 = stepWorld(w0, neutralFor(["a", "b"]));

    const a1 = w1.archers.get("a")!;
    expect(a1.alive).toBe(true);
    expect(a1.hasShield).toBe(false);

    const broken = w1.events.filter((e) => e.kind === "shield-broken");
    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({ victimId: "a", cause: "arrow" });

    // No archer-killed event despite the body overlap.
    expect(w1.events.some((e) => e.kind === "archer-killed")).toBe(false);
  });

  it("a SECOND arrow the same frame still kills the un-shielded archer", () => {
    const victim = shielded(stableArcher("a", 100, 100));
    const shooter = stableArcher("b", 200, 100);
    // Two arrows overlap the body simultaneously. We give them
    // distinct ids; sortById iteration order is alphabetical.
    const a1: Arrow = { ...overlappingArrow("b", 100, 100), id: "arrow-1" };
    const a2: Arrow = { ...overlappingArrow("b", 100, 100), id: "arrow-2" };
    const w0 = buildWorld([victim, shooter], [a1, a2]);
    const w1 = stepWorld(w0, neutralFor(["a", "b"]));

    const after = w1.archers.get("a")!;
    expect(after.alive).toBe(false);
    expect(after.hasShield).toBe(false);

    expect(w1.events.some((e) => e.kind === "shield-broken")).toBe(true);
    expect(w1.events.some((e) => e.kind === "archer-killed")).toBe(true);
  });
});

describe("shield — bomb explosion", () => {
  it("absorbs the blast: archer survives, hasShield=false, shield-broken cause='bomb'", () => {
    // Place an exploding bomb directly on top of a shielded archer.
    // The Phase 9a explosion AABB extends BOMB_RADIUS_PX in each
    // direction around the bomb's pos, which dwarfs the archer body.
    const victim = shielded(stableArcher("a", 100, 100));
    const shooter = stableArcher("b", 250, 100);
    const bomb: Arrow = {
      id: "bomb-1",
      type: "bomb",
      pos: { x: 100, y: 100 },
      vel: { x: 0, y: 0 },
      ownerId: "b",
      status: "exploding",
      age: 60,
      groundedTimer: 0,
      piercesUsed: 0,
      bouncesUsed: 0,
    };
    const w0 = buildWorld([victim, shooter], [bomb]);
    const w1 = stepWorld(w0, neutralFor(["a", "b"]));

    const a1 = w1.archers.get("a")!;
    expect(a1.alive).toBe(true);
    expect(a1.hasShield).toBe(false);
    // Shield-broken event with cause="bomb"; no archer-killed.
    const broken = w1.events.filter((e) => e.kind === "shield-broken");
    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({ victimId: "a", cause: "bomb" });
    expect(w1.events.some((e) => e.kind === "archer-killed")).toBe(false);
    expect(w1.events.some((e) => e.kind === "bomb-exploded")).toBe(true);
    // Sanity: BOMB_RADIUS_PX is the half-width so the test setup is
    // not relying on a coincidence.
    expect(BOMB_RADIUS_PX).toBeGreaterThan(0);
  });
});

describe("shield — stomp", () => {
  it("absorbs the stomp kill: archer survives, stomper still bounces", () => {
    // a stomps b; b is shielded. Stomp logic requires a's body AABB to
    // overlap b's head AABB and a.vel.y > 0. Place a directly on top
    // of b with downward velocity.
    const victim = shielded(stableArcher("b", 100, 100));
    const stomper: Archer = {
      ...stableArcher("a", 100, 89), // body bottom at y=100, head of b at y=100..103
      vel: { x: 0, y: 1 }, // falling
    };
    const w0 = buildWorld([stomper, victim]);
    const w1 = stepWorld(w0, neutralFor(["a", "b"]));

    const b1 = w1.archers.get("b")!;
    const a1 = w1.archers.get("a")!;
    expect(b1.alive).toBe(true);
    expect(b1.hasShield).toBe(false);
    // The stomper still bounces — STOMP_BOUNCE_VELOCITY applied to vy.
    // (After stepArcher's gravity + sweep on the next frame, the
    // y-velocity may have shifted, but on THIS frame's stomp branch
    // the engine has set it to STOMP_BOUNCE_VELOCITY pre-step. The
    // archer step then runs in step 3, so by the time we read it,
    // gravity has been added once. Just assert it's negative — an
    // upward kick.)
    expect(a1.vel.y).toBeLessThan(0);
    expect(STOMP_BOUNCE_VELOCITY).toBeLessThan(0);

    const broken = w1.events.filter((e) => e.kind === "shield-broken");
    expect(broken).toHaveLength(1);
    expect(broken[0]).toMatchObject({ victimId: "b", cause: "stomp" });
    expect(w1.events.some((e) => e.kind === "archer-killed")).toBe(false);
  });
});

describe("shield — chest delivery", () => {
  it("delivers a shield from a chest to the opener (hasShield=true)", () => {
    // We don't reach into the chest spawn flow here — that's tested
    // in chest.test.ts. We just verify the delivery branch by hand:
    // place an opening chest at openTimer=1 with shield contents, on
    // top of an alive archer.
    const opener = stableArcher("p1", 32, 16);
    expect(opener.hasShield).toBe(false);
    const w0: World = {
      ...buildWorld([opener]),
      chests: [
        {
          id: "ch-1",
          pos: { x: 32, y: 16 },
          status: "opening",
          openTimer: 1,
          openerId: "p1",
          contents: { kind: "shield" },
        },
      ],
    };
    const w1 = stepWorld(w0, neutralFor(["p1"]));
    expect(w1.chests).toHaveLength(0);
    expect(w1.archers.get("p1")!.hasShield).toBe(true);
  });

  it("a shielded archer opening a shield chest stays shielded (hasShield=true; no double-stack)", () => {
    const opener = shielded(stableArcher("p1", 32, 16));
    const w0: World = {
      ...buildWorld([opener]),
      chests: [
        {
          id: "ch-1",
          pos: { x: 32, y: 16 },
          status: "opening",
          openTimer: 1,
          openerId: "p1",
          contents: { kind: "shield" },
        },
      ],
    };
    const w1 = stepWorld(w0, neutralFor(["p1"]));
    expect(w1.archers.get("p1")!.hasShield).toBe(true);
  });
});

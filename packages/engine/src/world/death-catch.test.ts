import { describe, expect, it } from "vitest";
import {
  type ArcherInput,
  ARROW_SPEED,
  type MapData,
  type MapJson,
  MAX_INVENTORY,
  NEUTRAL_INPUT,
  SPAWN_ARROW_COUNT,
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

// Build an archer with all iframes off so collisions resolve immediately.
const stableArcher = (id: string, x: number, y: number): Archer => ({
  ...createArcher(id, { x, y }, "R"),
  spawnIframeTimer: 0,
});

const buildWorld = (
  archers: ReadonlyArray<Archer>,
  arrows: ReadonlyArray<Arrow> = [],
): World => {
  const map = blankMap();
  const m = new Map<string, Archer>();
  for (const a of archers) m.set(a.id, a);
  return { map, archers: m, arrows, tick: 0, events: [] };
};

const neutralFor = (ids: ReadonlyArray<string>): Map<string, ArcherInput> => {
  const m = new Map<string, ArcherInput>();
  for (const id of ids) m.set(id, NEUTRAL_INPUT);
  return m;
};

// Flying arrow that will land inside the body of an archer at (ax, ay).
// We place the arrow already overlapping the body so the collision
// triggers on the very first stepWorld (after stepArrow advances it,
// which only adds gravity — vy of an originally-horizontal arrow is
// 0.3 px after one frame, still well inside the 8x11 body).
const overlappingArrow = (
  ownerId: string,
  ax: number,
  ay: number,
): Arrow => ({
  id: "incoming",
  type: "normal",
  pos: { x: ax + 1, y: ay + 4 }, // squarely inside the body's middle row
  vel: { x: ARROW_SPEED, y: 0 },
  ownerId,
  status: "flying",
  age: 0,
  groundedTimer: 0,
});

describe("stepWorld — arrow ↔ archer death", () => {
  it("idle archer + flying arrow in body → killed, event emitted, arrow embedded", () => {
    const victim = stableArcher("a", 100, 100);
    const shooter = stableArcher("b", 200, 100);
    const arrow = overlappingArrow("b", 100, 100);
    const w0 = buildWorld([victim, shooter], [arrow]);
    const w1 = stepWorld(w0, neutralFor(["a", "b"]));

    const a1 = w1.archers.get("a")!;
    expect(a1.alive).toBe(false);
    expect(a1.deathTimer).toBe(0);

    const killEvents = w1.events.filter((e) => e.kind === "archer-killed");
    expect(killEvents).toHaveLength(1);
    expect(killEvents[0]).toMatchObject({
      kind: "archer-killed",
      victimId: "a",
      cause: "arrow",
      killerId: "b",
      tick: 0,
    });

    // The arrow embedded; drop arrows from victim death (inventory 3) appear too.
    const incoming = w1.arrows.find((a) => a.id === "incoming");
    expect(incoming).toBeDefined();
    expect(incoming!.status).toBe("embedded");
    expect(incoming!.vel.x).toBe(0);
    expect(incoming!.vel.y).toBe(0);
  });

  it("self-friendly-fire ignored (a flying arrow owned by the archer it overlaps)", () => {
    const a = stableArcher("a", 100, 100);
    const arrow = overlappingArrow("a", 100, 100); // ownerId === a.id
    const w0 = buildWorld([a], [arrow]);
    const w1 = stepWorld(w0, neutralFor(["a"]));
    const a1 = w1.archers.get("a")!;
    expect(a1.alive).toBe(true);
    expect(w1.events.some((e) => e.kind === "archer-killed")).toBe(false);
  });
});

describe("stepWorld — dodge catch", () => {
  it("dodging archer + flying arrow → caught, inventory +1, no death", () => {
    // dodgeIframeTimer > 0 marks the catch window. Dodge state itself
    // doesn't matter for the catch resolver — only the iframe.
    const victim: Archer = {
      ...stableArcher("a", 100, 100),
      inventory: 2,
      dodgeIframeTimer: 5,
      state: "dodging",
      dodgeTimer: 4,
    };
    const arrow = overlappingArrow("b", 100, 100);
    const w0 = buildWorld([victim], [arrow]);
    const w1 = stepWorld(w0, neutralFor(["a"]));

    const a1 = w1.archers.get("a")!;
    expect(a1.alive).toBe(true);
    expect(a1.inventory).toBe(3);
    expect(w1.arrows.find((arr) => arr.id === "incoming")).toBeUndefined();
    const catchEvents = w1.events.filter((e) => e.kind === "arrow-caught");
    expect(catchEvents).toHaveLength(1);
    expect(catchEvents[0]).toMatchObject({
      kind: "arrow-caught",
      arrowId: "incoming",
      catcherId: "a",
      tick: 0,
    });
  });

  it("catch with full inventory clamps at MAX_INVENTORY (no overflow)", () => {
    const victim: Archer = {
      ...stableArcher("a", 100, 100),
      inventory: MAX_INVENTORY,
      dodgeIframeTimer: 5,
    };
    const arrow = overlappingArrow("b", 100, 100);
    const w0 = buildWorld([victim], [arrow]);
    const w1 = stepWorld(w0, neutralFor(["a"]));

    const a1 = w1.archers.get("a")!;
    expect(a1.inventory).toBe(MAX_INVENTORY);
    expect(w1.arrows.find((arr) => arr.id === "incoming")).toBeUndefined();
    expect(w1.events.some((e) => e.kind === "arrow-caught")).toBe(true);
  });
});

describe("stepWorld — spawn iframe", () => {
  it("spawnIframeTimer > 0 → arrow passes through silently (no event)", () => {
    const victim: Archer = {
      ...createArcher("a", { x: 100, y: 100 }), // spawnIframeTimer = 60 by default
    };
    const arrow = overlappingArrow("b", 100, 100);
    const w0 = buildWorld([victim], [arrow]);
    const w1 = stepWorld(w0, neutralFor(["a"]));

    const a1 = w1.archers.get("a")!;
    expect(a1.alive).toBe(true);
    expect(a1.inventory).toBe(SPAWN_ARROW_COUNT); // unchanged — no catch either
    expect(w1.events.some((e) => e.kind === "archer-killed")).toBe(false);
    expect(w1.events.some((e) => e.kind === "arrow-caught")).toBe(false);
    // The arrow continues flying.
    const incoming = w1.arrows.find((arr) => arr.id === "incoming");
    expect(incoming).toBeDefined();
    expect(incoming!.status).toBe("flying");
  });
});

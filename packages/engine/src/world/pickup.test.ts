import { describe, expect, it } from "vitest";
import {
  type ArcherInput,
  type MapData,
  type MapJson,
  MAX_INVENTORY,
  NEUTRAL_INPUT,
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
  inventory: 0,
});

const buildWorld = (
  archers: ReadonlyArray<Archer>,
  arrows: ReadonlyArray<Arrow>,
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

const groundedArrow = (
  id: string,
  x: number,
  y: number,
  groundedTimer: number,
): Arrow => ({
  id,
  type: "normal",
  pos: { x, y },
  vel: { x: 0, y: 0 },
  ownerId: "shooter",
  status: "grounded",
  age: 100,
  groundedTimer,
  piercesUsed: 0,
  bouncesUsed: 0,
});

describe("stepWorld — pickup", () => {
  it("grounded arrow with groundedTimer = 0 + archer overlapping → pickup OK", () => {
    // Arrow at (104, 105) — well inside the body of an archer at (100, 100).
    const archer = stableArcher("a", 100, 100);
    const arrow = groundedArrow("g", 104, 105, 0);
    const w0 = buildWorld([archer], [arrow]);
    const w1 = stepWorld(w0, neutralFor(["a"]));

    const a1 = w1.archers.get("a")!;
    expect(a1.inventory).toBe(1);
    expect(w1.arrows.find((arr) => arr.id === "g")).toBeUndefined();
    const evt = w1.events.find((e) => e.kind === "arrow-picked-up");
    expect(evt).toBeDefined();
    expect(evt).toMatchObject({
      kind: "arrow-picked-up",
      arrowId: "g",
      pickerId: "a",
    });
  });

  it("groundedTimer > 0 → pickup denied (cooldown still active)", () => {
    const archer = stableArcher("a", 100, 100);
    const arrow = groundedArrow("g", 104, 105, /* still warm */ 5);
    const w0 = buildWorld([archer], [arrow]);
    const w1 = stepWorld(w0, neutralFor(["a"]));

    const a1 = w1.archers.get("a")!;
    expect(a1.inventory).toBe(0);
    // Arrow remains in the world but its timer counted down by one.
    const remaining = w1.arrows.find((arr) => arr.id === "g");
    expect(remaining).toBeDefined();
    expect(remaining!.groundedTimer).toBe(4);
    expect(w1.events.some((e) => e.kind === "arrow-picked-up")).toBe(false);
  });

  it("inventory full (MAX_INVENTORY) → pickup denied, arrow stays", () => {
    const archer: Archer = {
      ...stableArcher("a", 100, 100),
      inventory: MAX_INVENTORY,
    };
    const arrow = groundedArrow("g", 104, 105, 0);
    const w0 = buildWorld([archer], [arrow]);
    const w1 = stepWorld(w0, neutralFor(["a"]));

    expect(w1.archers.get("a")!.inventory).toBe(MAX_INVENTORY);
    expect(w1.arrows.find((arr) => arr.id === "g")).toBeDefined();
    expect(w1.events.some((e) => e.kind === "arrow-picked-up")).toBe(false);
  });

  it("embedded arrow is also pickable (status='embedded' + groundedTimer 0)", () => {
    const archer = stableArcher("a", 100, 100);
    const arrow: Arrow = {
      ...groundedArrow("e", 104, 105, 0),
      status: "embedded",
    };
    const w0 = buildWorld([archer], [arrow]);
    const w1 = stepWorld(w0, neutralFor(["a"]));
    expect(w1.archers.get("a")!.inventory).toBe(1);
  });
});

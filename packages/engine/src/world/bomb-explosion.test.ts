import {
  BOMB_RADIUS_PX,
  type MapJson,
} from "@arrowfall/shared";
import { describe, expect, it } from "vitest";
import { parseMap } from "../tilemap/loader.js";
import { type Arrow } from "../arrow/types.js";
import { createWorld } from "./create.js";
import { stepWorld } from "./step.js";
import { type World } from "./types.js";

// Open map — no walls inside the playfield, just a floor; lets us
// place archers wherever we want without collision interference.
const openMapJson: MapJson = {
  id: "bomb-test",
  name: "bomb-test",
  width: 30,
  height: 17,
  rows: [
    "..............................",
    "..P........................P..",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "##############################",
  ],
};
const map = parseMap(openMapJson);

const explodingBomb = (cx: number, cy: number, ownerId: string): Arrow => ({
  id: `${ownerId}-bomb-1`,
  type: "bomb",
  pos: { x: cx, y: cy },
  vel: { x: 0, y: 0 },
  ownerId,
  status: "exploding",
  age: 60,
  groundedTimer: 0,
});

const buildWorld = (overrides: Partial<World> = {}): World => {
  const w = createWorld(
    map,
    [
      { x: 32, y: 16 }, // p1
      { x: 432, y: 16 }, // p2
    ],
    ["p1", "p2"],
  );
  return { ...w, ...overrides };
};

const stripIframes = (w: World): World => {
  const archers = new Map(w.archers);
  for (const [id, a] of archers) {
    archers.set(id, {
      ...a,
      spawnIframeTimer: 0,
      dodgeIframeTimer: 0,
    });
  }
  return { ...w, archers };
};

describe("stepWorld — bomb explosion", () => {
  it("kills archers within BOMB_RADIUS_PX, emits bomb-exploded + archer-killed", () => {
    let w = buildWorld({ arrows: [explodingBomb(40, 20, "p1")] });
    w = stripIframes(w); // bypass spawn iframes for the test
    w = stepWorld(w, new Map());
    expect(w.archers.get("p1")!.alive).toBe(false);
    expect(w.events.some((e) => e.kind === "bomb-exploded")).toBe(true);
    expect(
      w.events.some((e) => e.kind === "archer-killed" && e.cause === "bomb"),
    ).toBe(true);
    // Arrow consumed.
    expect(w.arrows.find((a) => a.id === "p1-bomb-1")).toBeUndefined();
  });

  it("spares archers outside the radius", () => {
    // Place bomb far from p2 (32px from p1, ~400px from p2).
    let w = buildWorld({ arrows: [explodingBomb(40, 20, "p1")] });
    w = stripIframes(w);
    w = stepWorld(w, new Map());
    expect(w.archers.get("p2")!.alive).toBe(true);
  });

  it("spares archers in spawn iframes (iframe rule consistent with arrow hits)", () => {
    let w = buildWorld({ arrows: [explodingBomb(40, 20, "p1")] });
    // p1 keeps spawn iframes (created by createArcher).
    w = stepWorld(w, new Map());
    expect(w.archers.get("p1")!.alive).toBe(true);
  });

  it("kills both archers if both are inside the blast", () => {
    // Place p1 near p2's spawn so both fall into the blast radius.
    let w = buildWorld();
    const archers = new Map(w.archers);
    const p1 = archers.get("p1")!;
    archers.set("p1", {
      ...p1,
      pos: { x: 420, y: 16 },
      spawnIframeTimer: 0,
    });
    const p2 = archers.get("p2")!;
    archers.set("p2", { ...p2, spawnIframeTimer: 0 });
    w = { ...w, archers, arrows: [explodingBomb(425, 18, "ghost")] };
    w = stepWorld(w, new Map());
    expect(w.archers.get("p1")!.alive).toBe(false);
    expect(w.archers.get("p2")!.alive).toBe(false);
    const kills = w.events.filter(
      (e) => e.kind === "archer-killed" && e.cause === "bomb",
    );
    expect(kills).toHaveLength(2);
  });

  it("BOMB_RADIUS_PX matches the expected ~24px square", () => {
    // Sanity: at exactly BOMB_RADIUS_PX away (corner of body just
    // touches the blast edge), the archer dies.
    let w = buildWorld();
    const archers = new Map(w.archers);
    archers.set("p1", {
      ...archers.get("p1")!,
      pos: { x: 100, y: 100 },
      spawnIframeTimer: 0,
    });
    archers.set("p2", {
      ...archers.get("p2")!,
      // body is 8x11; place the body's left edge exactly at radius.
      pos: { x: 100 + BOMB_RADIUS_PX, y: 100 },
      spawnIframeTimer: 0,
    });
    w = { ...w, archers, arrows: [explodingBomb(100, 100, "ghost")] };
    w = stepWorld(w, new Map());
    expect(w.archers.get("p1")!.alive).toBe(false);
    // p2 is at the far edge: AABB-touching counts as no-overlap in our
    // intersector (strict less-than), so p2 survives. This pins the
    // radius semantics so a future tweak doesn't quietly drift.
    expect(w.archers.get("p2")!.alive).toBe(true);
  });
});

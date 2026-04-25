import { describe, expect, it } from "vitest";
import {
  type ArcherInput,
  type MapData,
  type MapJson,
  NEUTRAL_INPUT,
  STOMP_BOUNCE_VELOCITY,
} from "@arrowfall/shared";
import {
  ARCHER_HITBOX_H,
  type Archer,
  createArcher,
} from "../archer/types.js";
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

const stableArcher = (
  id: string,
  x: number,
  y: number,
  vy: number = 0,
): Archer => ({
  ...createArcher(id, { x, y }, "R"),
  vel: { x: 0, y: vy },
  spawnIframeTimer: 0,
});

const buildWorld = (archers: ReadonlyArray<Archer>): World => {
  const map = blankMap();
  const m = new Map<string, Archer>();
  for (const a of archers) m.set(a.id, a);
  return { map, archers: m, arrows: [], tick: 0, events: [] };
};

const neutralFor = (ids: ReadonlyArray<string>): Map<string, ArcherInput> => {
  const m = new Map<string, ArcherInput>();
  for (const id of ids) m.set(id, NEUTRAL_INPUT);
  return m;
};

describe("stepWorld — stomp", () => {
  it("A above B with vy>0, body(A) ∩ head(B) → B dies, A bounces", () => {
    // Place A's bottom flush with B's head: B at y=100 (head spans
    // y=100..103); A's body needs to overlap that region. A.y in
    // [89, 103) puts A.body (y..y+11) into the head band. We use
    // y=92 → A.body spans 92..103, B.head spans 100..103 → overlap.
    const a = stableArcher("a", 100, 92, /* vy */ 2.0);
    const b = stableArcher("b", 100, 100);
    const w0 = buildWorld([a, b]);
    const w1 = stepWorld(w0, neutralFor(["a", "b"]));

    const a1 = w1.archers.get("a")!;
    const b1 = w1.archers.get("b")!;
    expect(b1.alive).toBe(false);
    expect(a1.alive).toBe(true);
    expect(a1.vel.y).toBe(STOMP_BOUNCE_VELOCITY);

    const killEvents = w1.events.filter((e) => e.kind === "archer-killed");
    expect(killEvents).toHaveLength(1);
    expect(killEvents[0]).toMatchObject({
      kind: "archer-killed",
      victimId: "b",
      cause: "stomp",
      killerId: "a",
    });
  });

  it("no vertical overlap → no stomp, no death", () => {
    // A and B side-by-side at the same y, plenty of horizontal gap.
    const a = stableArcher("a", 100, 100, 2.0);
    const b = stableArcher("b", 200, 100);
    const w0 = buildWorld([a, b]);
    const w1 = stepWorld(w0, neutralFor(["a", "b"]));
    expect(w1.archers.get("a")!.alive).toBe(true);
    expect(w1.archers.get("b")!.alive).toBe(true);
    expect(w1.events.some((e) => e.kind === "archer-killed")).toBe(false);
  });

  it("B in dodge iframe → stomp cancelled (B survives, A keeps falling)", () => {
    const a = stableArcher("a", 100, 92, 2.0);
    const b: Archer = {
      ...stableArcher("b", 100, 100),
      dodgeIframeTimer: 5,
    };
    const w0 = buildWorld([a, b]);
    const w1 = stepWorld(w0, neutralFor(["a", "b"]));
    expect(w1.archers.get("b")!.alive).toBe(true);
    // A.vel.y must NOT have been overwritten to STOMP_BOUNCE_VELOCITY.
    // Gravity has applied (+0.3) so A.vel.y > 2.0 — definitely not -3.5.
    expect(w1.archers.get("a")!.vel.y).toBeGreaterThan(0);
  });

  it("A.vel.y <= 0 (rising) → no stomp even with overlap", () => {
    // Same overlap geometry as the success case, but A is rising.
    const a = stableArcher("a", 100, 92, /* vy */ -2.0);
    const b = stableArcher("b", 100, 100);
    const w0 = buildWorld([a, b]);
    const w1 = stepWorld(w0, neutralFor(["a", "b"]));
    expect(w1.archers.get("b")!.alive).toBe(true);
  });

  it("ARCHER_HITBOX_H constant matches the geometry assumption (8x11)", () => {
    // Small invariant check so a future bump to the body height doesn't
    // silently break the manually-tuned y values above.
    expect(ARCHER_HITBOX_H).toBe(11);
  });
});

import type { MapData } from "@arrowfall/shared";
import { describe, expect, it } from "vitest";
import { type Archer } from "../archer/index.js";
import { type World } from "../world/index.js";
import { getRoundOutcome } from "./index.js";

// Minimal Archer stub: getRoundOutcome only reads `archer.alive` and
// `archer.id`. Casting through `unknown` keeps the test orthogonal to
// any future Archer field bumps that don't affect outcome semantics.
const stubArcher = (id: string, alive: boolean): Archer => ({ id, alive }) as unknown as Archer;

const buildWorld = (archers: ReadonlyArray<Archer>): World => {
  const map = {} as unknown as MapData;
  return {
    map,
    archers: new Map(archers.map((a) => [a.id, a])),
    arrows: [],
    chests: [],
    tick: 0,
    events: [],
  };
};

describe("getRoundOutcome", () => {
  it("returns 'ongoing' while >= 2 archers are alive", () => {
    const w = buildWorld([stubArcher("p1", true), stubArcher("p2", true), stubArcher("p3", false)]);
    expect(getRoundOutcome(w)).toEqual({ kind: "ongoing" });
  });

  it("returns 'win' with the surviving archer's id when exactly 1 is alive", () => {
    const w = buildWorld([
      stubArcher("p1", false),
      stubArcher("p2", true),
      stubArcher("p3", false),
    ]);
    expect(getRoundOutcome(w)).toEqual({ kind: "win", winnerId: "p2" });
  });

  it("returns 'draw' when all archers are dead simultaneously", () => {
    const w = buildWorld([stubArcher("p1", false), stubArcher("p2", false)]);
    expect(getRoundOutcome(w)).toEqual({ kind: "draw" });
  });

  it("returns 'draw' on an empty roster (degenerate but well-defined)", () => {
    const w = buildWorld([]);
    expect(getRoundOutcome(w)).toEqual({ kind: "draw" });
  });

  it("treats a despawned dead body the same as an absent one (alive=false)", () => {
    // After DEATH_DURATION_FRAMES the engine drops the body from
    // world.archers entirely. Either way it counts as 0 toward `alive`.
    const w = buildWorld([stubArcher("p1", true), stubArcher("p2", false)]);
    expect(getRoundOutcome(w)).toEqual({ kind: "win", winnerId: "p1" });
  });
});

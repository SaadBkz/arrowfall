import { describe, expect, it } from "vitest";
import { createWorld, parseMap, stepWorld, type World } from "@arrowfall/engine";
import {
  NEUTRAL_INPUT,
  TILE_SIZE,
  type ArcherInput,
  type MapJson,
} from "@arrowfall/shared";
import arena01Json from "../maps/arena-01.json" with { type: "json" };
import { MatchState } from "./match-state.js";
import { worldToMatchState } from "./to-state.js";

const buildWorld = (ids: ReadonlyArray<string>): World => {
  const map = parseMap(arena01Json as MapJson);
  const spawns = map.spawns.map((s) => ({ x: s.x * TILE_SIZE, y: s.y * TILE_SIZE }));
  return createWorld(map, spawns, ids);
};

// state.archers is keyed by sessionId, archer.id is the engine slot
// (p1..p6). The mapping is provided by the room; tests synthesize it.
const sessionMap = (entries: ReadonlyArray<readonly [string, string]>): Map<string, string> =>
  new Map(entries);

describe("worldToMatchState", () => {
  it("mirrors archers from a fresh world into the schema state, keyed by sessionId", () => {
    const world = buildWorld(["p1", "p2"]);
    const state = new MatchState();
    const map = sessionMap([
      ["sess-A", "p1"],
      ["sess-B", "p2"],
    ]);

    worldToMatchState(world, state, map);

    expect(state.tick).toBe(0);
    expect(state.mapId).toBe(world.map.id);
    expect(state.archers.size).toBe(2);
    const sA = state.archers.get("sess-A")!;
    const wp1 = world.archers.get("p1")!;
    expect(sA.id).toBe("p1");
    expect(sA.posX).toBe(wp1.pos.x);
    expect(sA.posY).toBe(wp1.pos.y);
    expect(sA.alive).toBe(true);
    expect(sA.inventory).toBe(wp1.inventory);
    expect(state.arrows.length).toBe(0);
  });

  it("is idempotent — calling twice produces the same state shape", () => {
    const world = buildWorld(["p1", "p2"]);
    const state = new MatchState();
    const map = sessionMap([
      ["sA", "p1"],
      ["sB", "p2"],
    ]);
    worldToMatchState(world, state, map);
    const instSA = state.archers.get("sA")!;
    worldToMatchState(world, state, map);
    expect(state.archers.get("sA")).toBe(instSA);
    expect(state.archers.size).toBe(2);
  });

  it("reuses ArcherState instances across calls (no realloc per frame)", () => {
    const world = buildWorld(["p1"]);
    const state = new MatchState();
    const map = sessionMap([["sA", "p1"]]);
    worldToMatchState(world, state, map);
    const before = state.archers.get("sA");
    const stepped = stepWorld(
      world,
      new Map<string, ArcherInput>([["p1", NEUTRAL_INPUT]]),
    );
    worldToMatchState(stepped, state, map);
    expect(state.archers.get("sA")).toBe(before);
  });

  it("propagates position changes after a stepWorld call", () => {
    let world = buildWorld(["p1"]);
    const state = new MatchState();
    const map = sessionMap([["sA", "p1"]]);
    const right: ArcherInput = { ...NEUTRAL_INPUT, right: true };
    for (let i = 0; i < 30; i++) {
      world = stepWorld(world, new Map([["p1", right]]));
    }
    worldToMatchState(world, state, map);
    const wp1 = world.archers.get("p1")!;
    const sA = state.archers.get("sA")!;
    expect(sA.posX).toBe(wp1.pos.x);
    expect(sA.posY).toBe(wp1.pos.y);
    expect(sA.velX).toBe(wp1.vel.x);
    expect(state.tick).toBe(world.tick);
  });

  it("removes archers whose session left the room", () => {
    const wTwo = buildWorld(["p1", "p2"]);
    const state = new MatchState();
    const both = sessionMap([
      ["sA", "p1"],
      ["sB", "p2"],
    ]);
    worldToMatchState(wTwo, state, both);
    expect(state.archers.size).toBe(2);

    // sB disconnects: world rebuilt with only p1, mapping has only sA.
    const wOne = buildWorld(["p1"]);
    const onlyA = sessionMap([["sA", "p1"]]);
    worldToMatchState(wOne, state, onlyA);
    expect(state.archers.size).toBe(1);
    expect(state.archers.has("sA")).toBe(true);
    expect(state.archers.has("sB")).toBe(false);
  });

  it("upserts arrows by id and removes those that disappear", () => {
    let world = buildWorld(["p1"]);
    const map = sessionMap([["sA", "p1"]]);
    const shoot: ArcherInput = {
      ...NEUTRAL_INPUT,
      shoot: true,
      aimDirection: "E",
    };
    world = stepWorld(world, new Map([["p1", shoot]]));

    const state = new MatchState();
    worldToMatchState(world, state, map);
    expect(state.arrows.length).toBe(world.arrows.length);
    expect(state.arrows.length).toBeGreaterThan(0);

    const arrowId = world.arrows[0]!.id;
    const arrowInstance = state.arrows.find((a) => a.id === arrowId);
    expect(arrowInstance).toBeDefined();

    world = stepWorld(world, new Map([["p1", NEUTRAL_INPUT]]));
    worldToMatchState(world, state, map);
    const sameInstance = state.arrows.find((a) => a.id === arrowId);
    expect(sameInstance).toBe(arrowInstance);
  });
});

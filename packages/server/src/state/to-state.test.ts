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

describe("worldToMatchState", () => {
  it("mirrors archers from a fresh world into the schema state", () => {
    const world = buildWorld(["p1", "p2"]);
    const state = new MatchState();

    worldToMatchState(world, state);

    expect(state.tick).toBe(0);
    expect(state.mapId).toBe(world.map.id);
    expect(state.archers.size).toBe(2);
    const p1 = state.archers.get("p1")!;
    const wp1 = world.archers.get("p1")!;
    expect(p1.id).toBe("p1");
    expect(p1.posX).toBe(wp1.pos.x);
    expect(p1.posY).toBe(wp1.pos.y);
    expect(p1.alive).toBe(true);
    expect(p1.inventory).toBe(wp1.inventory);
    expect(state.arrows.length).toBe(0);
  });

  it("is idempotent — calling twice produces the same state shape", () => {
    const world = buildWorld(["p1", "p2"]);
    const state = new MatchState();
    worldToMatchState(world, state);
    const archerInstanceP1 = state.archers.get("p1")!;
    worldToMatchState(world, state);
    // Same instance reused (load-bearing for Colyseus diff efficiency).
    expect(state.archers.get("p1")).toBe(archerInstanceP1);
    expect(state.archers.size).toBe(2);
  });

  it("reuses ArcherState instances across calls (no realloc per frame)", () => {
    const world = buildWorld(["p1"]);
    const state = new MatchState();
    worldToMatchState(world, state);
    const before = state.archers.get("p1");
    const stepped = stepWorld(
      world,
      new Map<string, ArcherInput>([["p1", NEUTRAL_INPUT]]),
    );
    worldToMatchState(stepped, state);
    expect(state.archers.get("p1")).toBe(before);
  });

  it("propagates position changes after a stepWorld call", () => {
    let world = buildWorld(["p1"]);
    const state = new MatchState();
    // Walk right for 30 frames to exit any iframe edge cases.
    const right: ArcherInput = { ...NEUTRAL_INPUT, right: true };
    for (let i = 0; i < 30; i++) {
      world = stepWorld(world, new Map([["p1", right]]));
    }
    worldToMatchState(world, state);
    const wp1 = world.archers.get("p1")!;
    const sp1 = state.archers.get("p1")!;
    expect(sp1.posX).toBe(wp1.pos.x);
    expect(sp1.posY).toBe(wp1.pos.y);
    expect(sp1.velX).toBe(wp1.vel.x);
    expect(sp1.tick ?? state.tick).toBe(world.tick);
  });

  it("removes archers that are no longer in the world", () => {
    const wTwo = buildWorld(["p1", "p2"]);
    const state = new MatchState();
    worldToMatchState(wTwo, state);
    expect(state.archers.size).toBe(2);

    const wOne = buildWorld(["p1"]);
    worldToMatchState(wOne, state);
    expect(state.archers.size).toBe(1);
    expect(state.archers.has("p1")).toBe(true);
    expect(state.archers.has("p2")).toBe(false);
  });

  it("upserts arrows by id and removes those that disappear", () => {
    let world = buildWorld(["p1"]);
    // Make p1 shoot.
    const shoot: ArcherInput = {
      ...NEUTRAL_INPUT,
      shoot: true,
      aimDirection: "E",
    };
    // Wait out spawn iframes? Not needed — shooting is allowed during
    // iframes; an arrow spawns immediately.
    world = stepWorld(world, new Map([["p1", shoot]]));

    const state = new MatchState();
    worldToMatchState(world, state);
    expect(state.arrows.length).toBe(world.arrows.length);
    expect(state.arrows.length).toBeGreaterThan(0);

    const arrowId = world.arrows[0]!.id;
    const arrowInstance = state.arrows.find((a) => a.id === arrowId);
    expect(arrowInstance).toBeDefined();

    // Step further; arrow should still be tracked under the same instance.
    world = stepWorld(world, new Map([["p1", NEUTRAL_INPUT]]));
    worldToMatchState(world, state);
    const sameInstance = state.arrows.find((a) => a.id === arrowId);
    expect(sameInstance).toBe(arrowInstance);
  });
});

import {
  CHEST_MAX_SIMULTANEOUS,
  CHEST_SPAWN_MAX_INTERVAL_FRAMES,
  CHEST_SPAWN_MIN_INTERVAL_FRAMES,
  type Vec2,
} from "@arrowfall/shared";
import { type Chest } from "@arrowfall/engine";
import { afterEach, describe, expect, it } from "vitest";
import { ChestSpawner } from "./chest-spawner.js";

const tiles: Vec2[] = [
  { x: 224, y: 64 }, // a couple of CHEST_SPAWN tile positions in pixels
  { x: 256, y: 64 },
];

let nextId = 0;
const idAlloc = (): string => `c-${nextId++}`;

const newSpawner = (positions: Vec2[] = tiles): ChestSpawner =>
  new ChestSpawner({ chestSpawnsTilesPx: positions, nextChestId: idAlloc });

const stubChest = (pos: Vec2): Chest => ({
  id: `existing-${pos.x}-${pos.y}`,
  pos,
  status: "closed",
  openTimer: 0,
  openerId: null,
  contents: { type: "normal", count: 2 },
});

let realRandom: () => number;
afterEach(() => {
  if (realRandom !== undefined) {
    Math.random = realRandom;
    realRandom = undefined as unknown as () => number;
  }
  nextId = 0;
});

const pinRandom = (sequence: number[]): void => {
  realRandom = Math.random;
  let i = 0;
  Math.random = (): number => {
    const v = sequence[i % sequence.length]!;
    i++;
    return v;
  };
};

describe("ChestSpawner — schedule", () => {
  it("returns null until nextSpawnFrame is reached", () => {
    pinRandom([0]); // randomInterval picks the minimum
    const spawner = newSpawner();
    spawner.reset(0);
    expect(spawner.getNextSpawnFrameForTest()).toBe(CHEST_SPAWN_MIN_INTERVAL_FRAMES);

    expect(spawner.maybeSpawn(0, [])).toBeNull();
    expect(spawner.maybeSpawn(CHEST_SPAWN_MIN_INTERVAL_FRAMES - 1, [])).toBeNull();
  });

  it("spawns once nextSpawnFrame is hit and reschedules", () => {
    pinRandom([0]); // min interval, plus loot rolls (also using 0)
    const spawner = newSpawner();
    spawner.reset(0);

    const chest = spawner.maybeSpawn(CHEST_SPAWN_MIN_INTERVAL_FRAMES, []);
    expect(chest).not.toBeNull();
    expect(chest!.status).toBe("closed");
    expect(chest!.openTimer).toBe(0);
    // Re-schedule pushes nextSpawnFrame forward.
    expect(spawner.getNextSpawnFrameForTest()).toBeGreaterThan(
      CHEST_SPAWN_MIN_INTERVAL_FRAMES,
    );
  });

  it("randomInterval stays inside [MIN, MAX]", () => {
    // Pin random to the boundary values to ensure we don't go past them.
    pinRandom([0.999999]); // close to upper bound
    const spawner = newSpawner();
    spawner.reset(0);
    const next = spawner.getNextSpawnFrameForTest();
    expect(next).toBeGreaterThanOrEqual(CHEST_SPAWN_MIN_INTERVAL_FRAMES);
    expect(next).toBeLessThanOrEqual(CHEST_SPAWN_MAX_INTERVAL_FRAMES);
  });
});

describe("ChestSpawner — caps and free slots", () => {
  it("returns null when CHEST_MAX_SIMULTANEOUS chests are already on the map", () => {
    pinRandom([0]);
    const spawner = newSpawner();
    spawner.reset(0);
    const occupied: Chest[] = [];
    for (let i = 0; i < CHEST_MAX_SIMULTANEOUS; i++) {
      occupied.push(stubChest({ x: i * 32, y: 0 }));
    }
    expect(spawner.maybeSpawn(CHEST_SPAWN_MIN_INTERVAL_FRAMES, occupied)).toBeNull();
  });

  it("returns null when every CHEST_SPAWN tile is already taken (under cap)", () => {
    pinRandom([0]);
    // 1 spawn position only; an existing chest sits on it.
    const spawner = newSpawner([tiles[0]!]);
    spawner.reset(0);
    expect(
      spawner.maybeSpawn(CHEST_SPAWN_MIN_INTERVAL_FRAMES, [stubChest(tiles[0]!)]),
    ).toBeNull();
  });

  it("picks a free spawn position when one tile is occupied and another is free", () => {
    pinRandom([0]); // free[0] always picked → tiles[1] (since tiles[0] occupied)
    const spawner = newSpawner();
    spawner.reset(0);
    const chest = spawner.maybeSpawn(CHEST_SPAWN_MIN_INTERVAL_FRAMES, [stubChest(tiles[0]!)]);
    expect(chest).not.toBeNull();
    expect(chest!.pos).toEqual(tiles[1]);
  });
});

describe("ChestSpawner — loot table", () => {
  it("rolls a normal-arrow drop when rollLoot's Math.random < 0.6", () => {
    // Pin every call to a small value so all randomness uses 0.
    // Tick set well past the schedule so randomInterval doesn't matter.
    pinRandom([0]);
    const spawner = newSpawner();
    spawner.reset(0);
    const chest = spawner.maybeSpawn(CHEST_SPAWN_MAX_INTERVAL_FRAMES + 1, [])!;
    expect(chest.contents.type).toBe("normal");
    expect(chest.contents.count).toBe(2);
  });

  it("rolls a bomb-arrow drop when rollLoot's Math.random >= 0.6", () => {
    // Pin every call to a large value. randomInterval(0.99) = 478,
    // so we tick past that to guarantee the spawn fires.
    pinRandom([0.99]);
    const spawner = newSpawner();
    spawner.reset(0);
    const chest = spawner.maybeSpawn(CHEST_SPAWN_MAX_INTERVAL_FRAMES + 1, [])!;
    expect(chest.contents.type).toBe("bomb");
    expect(chest.contents.count).toBe(2);
  });
});

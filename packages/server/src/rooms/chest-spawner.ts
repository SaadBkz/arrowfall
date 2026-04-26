import {
  CHEST_BOMB_LOOT_COUNT,
  CHEST_DRILL_LOOT_COUNT,
  CHEST_LASER_LOOT_COUNT,
  CHEST_MAX_SIMULTANEOUS,
  CHEST_NORMAL_LOOT_COUNT,
  CHEST_SPAWN_MAX_INTERVAL_FRAMES,
  CHEST_SPAWN_MIN_INTERVAL_FRAMES,
  TILE_SIZE,
  type Vec2,
} from "@arrowfall/shared";
import { type Chest, type ChestContents } from "@arrowfall/engine";

// Phase 9a/9b — server-side chest spawner. Lives outside the engine
// because chest spawn cadence and loot are non-deterministic (random
// timing, random contents) — the engine stays pure / deterministic and
// only knows how to *step* a chest once it exists.
//
// Phase 9b loot table (spec §6.2 — full set):
//   50 % : 2 normal arrows
//   20 % : 2 bomb arrows
//   15 % : 2 drill arrows
//   10 % : 2 laser arrows
//    5 % : 1 shield (consumes a single lethal hit)
//
// PRNG: Math.random(). Spawn cadence and loot don't need to be
// reproducible across rooms / replays — the server is authoritative
// and broadcasts the resolved chest, so cross-client reproducibility
// is automatic. Tests monkey-patch Math.random to lock the schedule.

export type ChestIdAllocator = () => string;

export type ChestSpawnerConfig = {
  readonly chestSpawnsTilesPx: ReadonlyArray<Vec2>; // pixel coordinates of CHEST_SPAWN tiles
  readonly nextChestId: ChestIdAllocator;
};

// Loot table thresholds — cumulative bands on a [0, 1) roll. Order
// matters; the first band whose upper bound exceeds the roll wins.
// Centralised so chest-spawner.test.ts can assert each band lands its
// intended contents.
export const CHEST_LOOT_BANDS: ReadonlyArray<{
  readonly upperBound: number;
  readonly contents: ChestContents;
}> = [
  { upperBound: 0.5, contents: { kind: "arrows", type: "normal", count: CHEST_NORMAL_LOOT_COUNT } },
  { upperBound: 0.7, contents: { kind: "arrows", type: "bomb", count: CHEST_BOMB_LOOT_COUNT } },
  { upperBound: 0.85, contents: { kind: "arrows", type: "drill", count: CHEST_DRILL_LOOT_COUNT } },
  { upperBound: 0.95, contents: { kind: "arrows", type: "laser", count: CHEST_LASER_LOOT_COUNT } },
  { upperBound: 1.0, contents: { kind: "shield" } },
];

export class ChestSpawner {
  private readonly chestSpawnsPx: ReadonlyArray<Vec2>;
  private readonly nextChestId: ChestIdAllocator;
  private nextSpawnFrame: number = 0;

  constructor(config: ChestSpawnerConfig) {
    this.chestSpawnsPx = config.chestSpawnsTilesPx;
    this.nextChestId = config.nextChestId;
  }

  // Reset the spawner at the start of a fresh round. `currentTick` is
  // the World tick the round begins on; we add a random delay so the
  // first chest doesn't spawn at tick 0.
  reset(currentTick: number): void {
    this.nextSpawnFrame = currentTick + this.randomInterval();
  }

  // Returns a fresh Chest if one should spawn this tick, else null.
  // Caller (the room) is responsible for splicing it into the World's
  // chest list. We return null on:
  //   - the map having no CHEST_SPAWN tiles (degenerate)
  //   - the schedule not yet being ripe
  //   - the room already at CHEST_MAX_SIMULTANEOUS chests
  //   - every CHEST_SPAWN tile being occupied
  maybeSpawn(currentTick: number, currentChests: ReadonlyArray<Chest>): Chest | null {
    if (this.chestSpawnsPx.length === 0) return null;
    if (currentTick < this.nextSpawnFrame) return null;
    if (currentChests.length >= CHEST_MAX_SIMULTANEOUS) {
      // Don't reschedule — we keep checking each tick until a slot opens.
      return null;
    }
    const free = this.freeSpawnPositions(currentChests);
    if (free.length === 0) {
      // Every CHEST_SPAWN occupied — wait for a slot.
      return null;
    }
    const pos = free[Math.floor(Math.random() * free.length)]!;
    const chest: Chest = {
      id: this.nextChestId(),
      pos,
      status: "closed",
      openTimer: 0,
      openerId: null,
      contents: this.rollLoot(),
    };
    this.nextSpawnFrame = currentTick + this.randomInterval();
    return chest;
  }

  // Test hooks.
  getNextSpawnFrameForTest(): number {
    return this.nextSpawnFrame;
  }

  private freeSpawnPositions(currentChests: ReadonlyArray<Chest>): Vec2[] {
    const occupied = new Set<string>();
    for (const c of currentChests) {
      occupied.add(`${c.pos.x},${c.pos.y}`);
    }
    return this.chestSpawnsPx.filter((p) => !occupied.has(`${p.x},${p.y}`));
  }

  private randomInterval(): number {
    const min = CHEST_SPAWN_MIN_INTERVAL_FRAMES;
    const max = CHEST_SPAWN_MAX_INTERVAL_FRAMES;
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  private rollLoot(): ChestContents {
    const r = Math.random();
    for (const band of CHEST_LOOT_BANDS) {
      if (r < band.upperBound) return band.contents;
    }
    // Math.random() is < 1.0 but defensive: fall back to the last band.
    return CHEST_LOOT_BANDS[CHEST_LOOT_BANDS.length - 1]!.contents;
  }
}

// Convenience: convert MapData.chestSpawns (tile coords) to pixel coords
// for the ChestSpawner. Chest hitbox is anchored to the top-left of the
// tile, matching the engine's chestAabb.
export const chestSpawnsToPx = (tileCoords: ReadonlyArray<Vec2>): Vec2[] =>
  tileCoords.map((t) => ({ x: t.x * TILE_SIZE, y: t.y * TILE_SIZE }));

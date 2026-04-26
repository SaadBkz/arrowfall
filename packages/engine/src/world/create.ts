import { type MapData, type Vec2 } from "@arrowfall/shared";
import { type Archer, createArcher } from "../archer/types.js";
import { type World } from "./types.js";

// Build the initial World for a fresh round. Archers are spawned in
// alphabetical id order at successive `spawnPoints`; if there are fewer
// spawn points than archers, the extras wrap modulo (so 4 archers on a
// 2-spawn map share the two spawns — pragmatic, not a real game rule).
//
// `spawnPoints` are in PIXEL coordinates (the archer top-left). Callers
// pulling from MapData.spawns (which is tile-indexed) must multiply by
// TILE_SIZE first; the demo / tests do this explicitly.
//
// All archers start with full inventory + spawn iframes already armed
// (createArcher handles those defaults). The events list is empty —
// stepWorld owns event emission.
export const createWorld = (
  map: MapData,
  spawnPoints: ReadonlyArray<Vec2>,
  archerIds: ReadonlyArray<string>,
): World => {
  if (spawnPoints.length === 0) {
    throw new Error("createWorld: at least one spawn point is required");
  }
  const sortedIds = [...archerIds].sort();
  const archers = new Map<string, Archer>();
  for (let i = 0; i < sortedIds.length; i++) {
    const id = sortedIds[i]!;
    const spawn = spawnPoints[i % spawnPoints.length]!;
    archers.set(id, createArcher(id, spawn));
  }
  return {
    map,
    archers,
    arrows: [],
    chests: [],
    tick: 0,
    events: [],
  };
};

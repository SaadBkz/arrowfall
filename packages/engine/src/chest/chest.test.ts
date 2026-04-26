import {
  CHEST_OPEN_DURATION_FRAMES,
  type MapJson,
  TILE_SIZE,
} from "@arrowfall/shared";
import { describe, expect, it } from "vitest";
import { createWorld } from "../world/create.js";
import { stepWorld } from "../world/step.js";
import { type World } from "../world/types.js";
import { stepChest } from "./step.js";
import { type Chest, type ChestContents } from "./types.js";

const mapJson: MapJson = {
  id: "chest-test",
  name: "chest-test",
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

import { parseMap } from "../tilemap/loader.js";
const map = parseMap(mapJson);

// Spawn p1 at a fixed corner unless `archerOnChest` is true, in which
// case p1 spawns ON the chest tile (used to test the contact path).
const buildWorld = (
  chest: Chest | null,
  archerOnChest: boolean = true,
): World => {
  const spawnPx =
    chest !== null && archerOnChest ? [chest.pos] : [{ x: 32, y: 16 }];
  const w = createWorld(map, spawnPx, ["p1"]);
  return chest === null ? w : { ...w, chests: [chest] };
};

const makeChest = (overrides: Partial<Chest> = {}): Chest => ({
  id: "chest-1",
  pos: { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE },
  status: "closed",
  openTimer: 0,
  openerId: null,
  contents: { kind: "arrows", type: "normal", count: 2 } as ChestContents,
  ...overrides,
});

describe("stepChest — pure timer", () => {
  it("decrements openTimer on an opening chest", () => {
    const chest = makeChest({ status: "opening", openTimer: 10, openerId: "p1" });
    const next = stepChest(chest);
    expect(next.openTimer).toBe(9);
  });

  it("no-op on a closed chest (timer stays at 0)", () => {
    const chest = makeChest({ status: "closed", openTimer: 0 });
    const next = stepChest(chest);
    expect(next).toEqual(chest);
  });

  it("clamps openTimer at 0", () => {
    const chest = makeChest({ status: "opening", openTimer: 0, openerId: "p1" });
    const next = stepChest(chest);
    expect(next.openTimer).toBe(0);
  });
});

describe("stepWorld — chest open flow", () => {
  it("flips closed → opening when an alive archer overlaps", () => {
    // Place chest at p1's spawn so they overlap on tick 0.
    const chest = makeChest({
      pos: { x: 2 * TILE_SIZE, y: 1 * TILE_SIZE },
    });
    const w = buildWorld(chest);
    const next = stepWorld(w, new Map());
    expect(next.chests).toHaveLength(1);
    expect(next.chests[0]!.status).toBe("opening");
    expect(next.chests[0]!.openerId).toBe("p1");
    // stepChest is called BEFORE the closed→opening check, so the
    // freshly-opened chest's timer stays at the full duration this
    // frame. The decrement starts on the next stepWorld call.
    expect(next.chests[0]!.openTimer).toBe(CHEST_OPEN_DURATION_FRAMES);
  });

  it("does NOT flip on a chest the archer never reaches", () => {
    const chest = makeChest({ pos: { x: 25 * TILE_SIZE, y: 15 * TILE_SIZE } });
    const w = buildWorld(chest, /* archerOnChest */ false);
    const next = stepWorld(w, new Map());
    expect(next.chests[0]!.status).toBe("closed");
    expect(next.chests[0]!.openerId).toBeNull();
  });

  it("delivers normal-arrow loot to the opener and emits chest-opened", () => {
    const chest = makeChest({
      pos: { x: 2 * TILE_SIZE, y: 1 * TILE_SIZE },
      status: "opening",
      openTimer: 1,
      openerId: "p1",
      contents: { kind: "arrows", type: "normal", count: 2 },
    });
    let w = buildWorld(chest);
    const startInv = w.archers.get("p1")!.inventory;
    w = stepWorld(w, new Map());
    expect(w.chests).toHaveLength(0); // removed after delivery
    expect(w.archers.get("p1")!.inventory).toBe(startInv + 2);
    const opened = w.events.filter((e) => e.kind === "chest-opened");
    expect(opened).toHaveLength(1);
  });

  it("delivers bomb loot to bombInventory (separate counter)", () => {
    const chest = makeChest({
      pos: { x: 2 * TILE_SIZE, y: 1 * TILE_SIZE },
      status: "opening",
      openTimer: 1,
      openerId: "p1",
      contents: { kind: "arrows", type: "bomb", count: 2 },
    });
    let w = buildWorld(chest);
    const startBombs = w.archers.get("p1")!.bombInventory;
    const startNormal = w.archers.get("p1")!.inventory;
    w = stepWorld(w, new Map());
    expect(w.archers.get("p1")!.bombInventory).toBe(startBombs + 2);
    expect(w.archers.get("p1")!.inventory).toBe(startNormal); // untouched
  });

  it("removes the chest even if the opener died before delivery (no inventory bump)", () => {
    const chest = makeChest({
      pos: { x: 2 * TILE_SIZE, y: 1 * TILE_SIZE },
      status: "opening",
      openTimer: 1,
      openerId: "ghost", // never existed in the world
      contents: { kind: "arrows", type: "normal", count: 2 },
    });
    const w = buildWorld(chest);
    const next = stepWorld(w, new Map());
    expect(next.chests).toHaveLength(0);
    expect(next.events.some((e) => e.kind === "chest-opened")).toBe(true);
  });
});

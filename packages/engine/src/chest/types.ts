import { type AABB, type ArrowType, type Vec2 } from "@arrowfall/shared";

// Phase 9a — treasure chests (spec §6).
//
// Lifecycle:
//   closed   — sitting on a CHEST_SPAWN tile, waiting for an archer
//              to walk into it.
//   opening  — animation in progress, openTimer counts down to 0.
//              Any further contact during this window is a no-op
//              (the original opener gets the loot).
//   opened   — transient (lives at most one tick): stepWorld delivers
//              the contents to the opener, emits an event, and removes
//              the chest from the array.
export type ChestStatus = "closed" | "opening" | "opened";

// Phase 9b — chest contents are a discriminated union: arrows (any
// ArrowType + count) OR a shield. Decided server-side at spawn time
// (loot table + RNG), so the engine stays deterministic. The wire
// schema flattens this into `lootKind` ("arrows" | "shield") +
// `lootType` (ArrowType, ignored when kind="shield") + `lootCount`
// (ignored when kind="shield").
export type ChestArrowContents = {
  readonly kind: "arrows";
  readonly type: ArrowType;
  readonly count: number;
};
export type ChestShieldContents = {
  readonly kind: "shield";
};
export type ChestContents = ChestArrowContents | ChestShieldContents;

export type Chest = {
  readonly id: string; // stable, server-assigned
  readonly pos: Vec2; // top-left of the 16×16 hitbox
  readonly status: ChestStatus;
  readonly openTimer: number; // frames remaining in the "opening" anim
  readonly openerId: string | null; // archer slot id who triggered it
  readonly contents: ChestContents;
};

// Chest hitbox = one full tile (TILE_SIZE = 16). Anchored top-left so
// the chest sits exactly on the CHEST_SPAWN cell it was placed on.
export const CHEST_W = 16;
export const CHEST_H = 16;

export const chestAabb = (chest: Chest): AABB => ({
  x: chest.pos.x,
  y: chest.pos.y,
  w: CHEST_W,
  h: CHEST_H,
});

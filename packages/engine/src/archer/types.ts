import {
  SPAWN_ARROW_COUNT,
  SPAWN_IFRAME_FRAMES,
  type Vec2,
} from "@arrowfall/shared";
import { HITBOX_H, HITBOX_W } from "../physics/collide.js";

export type ArcherState = "idle" | "dodging";
export type Facing = "L" | "R";

export type Archer = {
  readonly id: string;
  readonly pos: Vec2; // top-left of the 8x11 hitbox
  readonly vel: Vec2;
  readonly facing: Facing;
  readonly state: ArcherState;
  // Timers in frames. 0 = inactive. Decremented by stepArcher.
  readonly dodgeTimer: number;
  readonly dodgeIframeTimer: number;
  readonly dodgeCooldownTimer: number;
  readonly coyoteTimer: number;
  readonly jumpBufferTimer: number;
  // Cached previous-frame bottom edge for the JUMPTHRU semantics — see
  // collide.ts. Reset every step from pos.y + HITBOX_H.
  readonly prevBottom: number;
  // Phase 3 — combat / lifecycle.
  readonly inventory: number; // normal arrows (0..MAX_INVENTORY); spawn = SPAWN_ARROW_COUNT
  readonly shootCooldownTimer: number; // > 0 blocks new shots
  readonly alive: boolean; // false after a lethal hit
  readonly deathTimer: number; // frames since death; client uses this for the
  // fragmentation animation, world uses it to despawn after DEATH_DURATION_FRAMES
  readonly spawnIframeTimer: number; // > 0 → arrows pass through, stomp ignored
  // Phase 9a — special-arrow inventory. Bombs share the same MAX_INVENTORY
  // cap as normal arrows but are tracked in a separate counter so the wire
  // schema stays a flat (uint8, uint8) instead of a typed stack. Phase 9b
  // adds drillInventory / laserInventory / hasShield in the same shape; if
  // we hit ~5 of these we'll refactor to a single typed array.
  readonly bombInventory: number;
};

export const createArcher = (
  id: string,
  spawn: Vec2,
  facing: Facing = "R",
): Archer => ({
  id,
  pos: spawn,
  vel: { x: 0, y: 0 },
  facing,
  state: "idle",
  dodgeTimer: 0,
  dodgeIframeTimer: 0,
  dodgeCooldownTimer: 0,
  coyoteTimer: 0,
  jumpBufferTimer: 0,
  prevBottom: spawn.y + HITBOX_H,
  inventory: SPAWN_ARROW_COUNT,
  shootCooldownTimer: 0,
  alive: true,
  deathTimer: 0,
  spawnIframeTimer: SPAWN_IFRAME_FRAMES,
  bombInventory: 0,
});

// Re-exported so callers can build their own AABB from an Archer without
// reaching into ../physics/collide.
export const ARCHER_HITBOX_W = HITBOX_W;
export const ARCHER_HITBOX_H = HITBOX_H;

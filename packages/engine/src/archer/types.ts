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
  // Phase 9a/9b — special-arrow inventory. Each special type lives in
  // its own counter so the wire schema stays a flat row of uint8s
  // (typed-stack refactor deferred until we add a 5th special type).
  // applyShoot consumes them in priority order: laser > drill > bomb >
  // normal — picked-up specials get fired before the player's stock
  // normals, which matches the "loot is impactful" UX intent.
  readonly bombInventory: number;
  readonly drillInventory: number;
  readonly laserInventory: number;
  // Phase 9b — shield. true after a shield pickup; absorbs the next
  // lethal hit (arrow / bomb / stomp) and is consumed in the process,
  // emitting a `shield-broken` event. No timer: the shield lasts until
  // it's used or the round ends (a fresh round resets via createArcher).
  readonly hasShield: boolean;
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
  drillInventory: 0,
  laserInventory: 0,
  hasShield: false,
});

// Re-exported so callers can build their own AABB from an Archer without
// reaching into ../physics/collide.
export const ARCHER_HITBOX_W = HITBOX_W;
export const ARCHER_HITBOX_H = HITBOX_H;

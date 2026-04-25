import {
  type ArcherInput,
  ARROW_SPEED,
  aimVector,
  MAX_INVENTORY,
  SHOOT_COOLDOWN_FRAMES,
} from "@arrowfall/shared";
import { ARROW_H, ARROW_W, type Arrow } from "../arrow/types.js";
import { ARCHER_HITBOX_H, ARCHER_HITBOX_W, type Archer } from "./types.js";

export type ShootResult = {
  readonly archer: Archer;
  readonly newArrow: Arrow | null;
};

// Pure: returns the (possibly updated) archer and a new Arrow if a shot
// fired this frame. Conditions for a shot:
//   - alive
//   - state === 'idle' (cannot shoot during a dodge)
//   - input.shoot edge is high
//   - shootCooldownTimer === 0 (post-cooldown)
//   - inventory > 0
//
// On a successful shot we decrement inventory by 1 (clamped 0..MAX_INVENTORY
// for safety; the precondition keeps it above 0), reset shootCooldownTimer
// to SHOOT_COOLDOWN_FRAMES, and emit one Arrow whose initial velocity is
// `aimVector(input, facing) * ARROW_SPEED`.
//
// Spawn pos: the arrow's centre is placed half a body-width past the
// archer's centre in the aim direction, so a freshly-spawned arrow does
// not immediately overlap its own shooter (which would otherwise either
// trigger a self-friendly-fire check or stomp the body hitbox on frame 0).
//
// id is fully deterministic — built from the World's `${ownerId}-arrow-
// ${tick}-${shootCounter}`-style suffix passed in as `idSuffix`. We do
// not want timestamps or RNG.
export const applyShoot = (
  archer: Archer,
  input: ArcherInput,
  idSuffix: string,
): ShootResult => {
  if (!archer.alive) return { archer, newArrow: null };
  if (archer.state !== "idle") return { archer, newArrow: null };
  if (!input.shoot) return { archer, newArrow: null };
  if (archer.shootCooldownTimer > 0) return { archer, newArrow: null };
  if (archer.inventory <= 0) return { archer, newArrow: null };

  const dir = aimVector(input, archer.facing);

  // Centre of the body in pixel space, then offset by half a body-width
  // along `dir` so the arrow spawns just past the body edge.
  const cx = archer.pos.x + ARCHER_HITBOX_W / 2;
  const cy = archer.pos.y + ARCHER_HITBOX_H / 2;
  const spawnCx = cx + (ARCHER_HITBOX_W / 2) * dir.x;
  const spawnCy = cy + (ARCHER_HITBOX_H / 2) * dir.y;

  const newArrow: Arrow = {
    id: `${archer.id}-arrow-${idSuffix}`,
    type: "normal",
    pos: { x: spawnCx - ARROW_W / 2, y: spawnCy - ARROW_H / 2 },
    vel: { x: dir.x * ARROW_SPEED, y: dir.y * ARROW_SPEED },
    ownerId: archer.id,
    status: "flying",
    age: 0,
    groundedTimer: 0,
  };

  const nextInventory = Math.max(
    0,
    Math.min(MAX_INVENTORY, archer.inventory - 1),
  );

  return {
    archer: {
      ...archer,
      inventory: nextInventory,
      shootCooldownTimer: SHOOT_COOLDOWN_FRAMES,
    },
    newArrow,
  };
};

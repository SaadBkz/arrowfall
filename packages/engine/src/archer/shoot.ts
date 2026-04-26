import {
  type ArcherInput,
  ARROW_SPEED,
  BOMB_ARROW_SPEED,
  aimVector,
  MAX_INVENTORY,
  SHOOT_COOLDOWN_FRAMES,
} from "@arrowfall/shared";
import { ARROW_H, ARROW_W, type Arrow, type ArrowType } from "../arrow/types.js";
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
//   - inventory > 0 (sum of normal + bomb counts)
//
// Phase 9a — special-arrow priority: bombs are spent first when held.
// Rationale: a player who picks up bombs from a chest typically wants
// the explosion now, not later. If you grab bombs but want to shoot
// normals, dodge a few times to expend the bombs… or not — TowerFall's
// MVP doesn't have an inventory selector, so this is the simplest
// rule that makes loot feel impactful.
//
// On a successful shot we decrement the appropriate counter, reset
// shootCooldownTimer to SHOOT_COOLDOWN_FRAMES, and emit one Arrow whose
// type/speed match the slot fired.
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

  // Pick the type to fire. Bombs first (Phase 9a), then normals.
  let firedType: ArrowType;
  let muzzleSpeed: number;
  let nextNormalInventory = archer.inventory;
  let nextBombInventory = archer.bombInventory;
  if (archer.bombInventory > 0) {
    firedType = "bomb";
    muzzleSpeed = BOMB_ARROW_SPEED;
    nextBombInventory = Math.max(0, Math.min(MAX_INVENTORY, archer.bombInventory - 1));
  } else if (archer.inventory > 0) {
    firedType = "normal";
    muzzleSpeed = ARROW_SPEED;
    nextNormalInventory = Math.max(0, Math.min(MAX_INVENTORY, archer.inventory - 1));
  } else {
    return { archer, newArrow: null };
  }

  const dir = aimVector(input, archer.facing);

  // Centre of the body in pixel space, then offset by half a body-width
  // along `dir` so the arrow spawns just past the body edge.
  const cx = archer.pos.x + ARCHER_HITBOX_W / 2;
  const cy = archer.pos.y + ARCHER_HITBOX_H / 2;
  const spawnCx = cx + (ARCHER_HITBOX_W / 2) * dir.x;
  const spawnCy = cy + (ARCHER_HITBOX_H / 2) * dir.y;

  const newArrow: Arrow = {
    id: `${archer.id}-arrow-${idSuffix}`,
    type: firedType,
    pos: { x: spawnCx - ARROW_W / 2, y: spawnCy - ARROW_H / 2 },
    vel: { x: dir.x * muzzleSpeed, y: dir.y * muzzleSpeed },
    ownerId: archer.id,
    status: "flying",
    age: 0,
    groundedTimer: 0,
  };

  return {
    archer: {
      ...archer,
      inventory: nextNormalInventory,
      bombInventory: nextBombInventory,
      shootCooldownTimer: SHOOT_COOLDOWN_FRAMES,
    },
    newArrow,
  };
};

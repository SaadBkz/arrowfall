import { arrowProfile } from "@arrowfall/shared";
import {
  ARCHER_HITBOX_H,
  ARCHER_HITBOX_W,
  type Archer,
} from "../archer/types.js";
import { ARROW_H, ARROW_W, type Arrow, type ArrowType } from "./types.js";

// Spec §3.2 — when an archer dies, its remaining inventory is ejected in
// an arc around the death point. We use a *fully deterministic* scheme
// (no PRNG): for N arrows, angles are evenly spaced in the upper half-
// circle, excluding the strictly horizontal endpoints. This gives a
// fan-shaped spray that wraps gracefully around the death point and
// removes any need for a seeded RNG.
//
// Angle convention: 0 rad = +X (right), -π/2 = up. We pick angles in
// (-π, 0) so every dropped arrow has vy < 0 at spawn (gravity then pulls
// them back down quickly to grounded).
//
// arrowIdBase MUST be deterministic across client/server (the World
// caller derives it from `${ownerId}-death-${tick}`).
export const dropArrowsOnDeath = (
  archer: Archer,
  arrowIdBase: string,
): readonly Arrow[] => {
  // Phase 9a/9b — eject in a fixed type order so the fan is deterministic
  // across runs: normals → bombs → drills → lasers. The id suffix uses
  // the global index, so the order does not depend on field iteration.
  // Each type spawns with its own muzzle speed (ARROW_PROFILES) so the
  // visual reads as "this is a bomb/drill/laser spilling out" rather
  // than every dropped arrow flying at the normal speed.
  const types: ArrowType[] = [
    ...new Array<ArrowType>(archer.inventory).fill("normal"),
    ...new Array<ArrowType>(archer.bombInventory).fill("bomb"),
    ...new Array<ArrowType>(archer.drillInventory).fill("drill"),
    ...new Array<ArrowType>(archer.laserInventory).fill("laser"),
  ];
  const n = types.length;
  if (n <= 0) return [];

  // Anchor at the centre of the body so the fan blooms from the chest.
  const cx = archer.pos.x + ARCHER_HITBOX_W / 2 - ARROW_W / 2;
  const cy = archer.pos.y + ARCHER_HITBOX_H / 2 - ARROW_H / 2;

  const out: Arrow[] = [];
  for (let i = 0; i < n; i++) {
    // Evenly space N angles in (-π, 0): angle_i = -π + π · (i+1)/(N+1).
    // For N=1 this is -π/2 (straight up); for N=3 it is NW, N, NE; etc.
    const angle = -Math.PI + (Math.PI * (i + 1)) / (n + 1);
    const type = types[i]!;
    const speed = arrowProfile(type).speed;
    const vx = speed * Math.cos(angle);
    const vy = speed * Math.sin(angle);
    out.push({
      id: `${arrowIdBase}-${i}`,
      type,
      pos: { x: cx, y: cy },
      vel: { x: vx, y: vy },
      ownerId: archer.id,
      status: "flying",
      age: 0,
      groundedTimer: 0,
      piercesUsed: 0,
      bouncesUsed: 0,
    });
  }
  return out;
};

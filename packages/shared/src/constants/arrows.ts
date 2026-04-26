// Phase 9b — central registry of arrow types + per-type physics profiles.
// Lives in @arrowfall/shared (rather than engine) because the wire schema
// and the renderer also need to know the ArrowType union, and shared has
// no other dependencies. Engine re-exports ArrowType for back-compat with
// Phase 3-9a call sites.
//
// New types added vs. Phase 9a (which shipped Normal + Bomb only):
//   - "drill" : pierces a single SOLID tile before final impact.
//   - "laser" : no gravity, bounces up to LASER_MAX_BOUNCES times,
//               disappears after LASER_LIFETIME_FRAMES.
//
// Bramble + Feather are explicitly hors-scope (spec §13).
//
// ArrowImpact describes how stepArrow should resolve a SOLID hit:
//   - "embed"   : standard — clamp to surface, status="embedded",
//                 pickup grace armed (Normal, Drill on its second hit).
//   - "explode" : flip to status="exploding", stepWorld harvests the
//                 blast (Bomb).
//   - "pierce"  : pass through one SOLID tile, increment piercesUsed,
//                 keep flying. After DRILL_MAX_PIERCES the impact mode
//                 falls back to "embed".
//   - "bounce"  : reflect velocity perpendicular to the surface,
//                 increment bouncesUsed. After LASER_MAX_BOUNCES the
//                 arrow despawns (status="exploding" used as the same
//                 "remove this tick" signal stepWorld already harvests).

import {
  ARROW_SPEED,
  BOMB_ARROW_SPEED,
  DRILL_ARROW_SPEED,
  LASER_ARROW_SPEED,
} from "./physics.js";

export type ArrowType = "normal" | "bomb" | "drill" | "laser";

export type ArrowImpactMode = "embed" | "explode" | "pierce" | "bounce";

export type ArrowProfile = {
  readonly speed: number;
  readonly gravity: boolean;
  readonly impact: ArrowImpactMode;
};

export const ARROW_PROFILES: Readonly<Record<ArrowType, ArrowProfile>> = {
  normal: { speed: ARROW_SPEED, gravity: true, impact: "embed" },
  bomb: { speed: BOMB_ARROW_SPEED, gravity: true, impact: "explode" },
  drill: { speed: DRILL_ARROW_SPEED, gravity: true, impact: "pierce" },
  laser: { speed: LASER_ARROW_SPEED, gravity: false, impact: "bounce" },
};

export const arrowProfile = (type: ArrowType): ArrowProfile =>
  ARROW_PROFILES[type];

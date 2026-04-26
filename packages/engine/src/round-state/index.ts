import { type World } from "../world/index.js";

// Last Archer Standing outcome (spec §7.1). Pure & engine-only so client
// and server can share it — Phase 8 needs the same predicate authoritative
// on the server (drives round/match transitions) and locally on the client
// (drives the win-text overlay during the predicted frame).
//
// Freeze policy: as soon as the alive-count drops to ≤ 1 we emit `win`
// or `draw`. We deliberately use `archer.alive` (the boolean), NOT
// `deathTimer`, because:
//   - the kill is decided at the frame of impact (that's when the
//     winner is determined; the 30-frame fragmentation that follows is
//     pure cosmetics);
//   - `world.archers` keeps a dead archer entry for DEATH_DURATION_FRAMES
//     after the kill, so counting dead-or-alive bodies would defer the
//     win message ~0.5 s with no informational gain.
// The render layer is free to overlay the win text while the death
// animation finishes underneath.
export type RoundOutcome =
  | { readonly kind: "ongoing" }
  | { readonly kind: "win"; readonly winnerId: string }
  | { readonly kind: "draw" };

export const getRoundOutcome = (world: World): RoundOutcome => {
  let alive = 0;
  let lastAliveId: string | null = null;
  for (const archer of world.archers.values()) {
    if (archer.alive) {
      alive += 1;
      lastAliveId = archer.id;
    }
  }
  if (alive >= 2) return { kind: "ongoing" };
  if (alive === 1 && lastAliveId !== null) return { kind: "win", winnerId: lastAliveId };
  return { kind: "draw" };
};

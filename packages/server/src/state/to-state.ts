import type { World } from "@arrowfall/engine";
import { ArcherState } from "./archer-state.js";
import { ArrowState } from "./arrow-state.js";
import type { MatchState } from "./match-state.js";

// Mutate `state` in place to mirror `world`. Idempotent: calling it twice
// with the same World produces the same patch set on the second call
// (zero ops). Reuses existing ArcherState / ArrowState instances when ids
// match — only the changed scalar fields emit patches on the wire.
//
// Why mutate instead of returning a fresh state: @colyseus/schema tracks
// changes by object identity. Allocating a new ArcherState every frame
// would re-emit the full payload (and gradually leak ids on the client).
export const worldToMatchState = (world: World, state: MatchState): void => {
  state.tick = world.tick;
  if (state.mapId !== world.map.id) {
    state.mapId = world.map.id;
  }

  // Archers: upsert by id, then prune entries no longer in world.
  // Iteration order doesn't matter for the wire output (the schema only
  // tracks per-key diffs), but we keep alphabetical to match the engine.
  const seenArchers = new Set<string>();
  const sortedArcherIds = [...world.archers.keys()].sort();
  for (const id of sortedArcherIds) {
    const archer = world.archers.get(id)!;
    let s = state.archers.get(id);
    if (s === undefined) {
      s = new ArcherState();
      s.id = id;
      state.archers.set(id, s);
    }
    s.posX = archer.pos.x;
    s.posY = archer.pos.y;
    s.velX = archer.vel.x;
    s.velY = archer.vel.y;
    s.facing = archer.facing;
    s.state = archer.state;
    s.inventory = archer.inventory;
    s.alive = archer.alive;
    s.deathTimer = archer.deathTimer;
    s.spawnIframeTimer = archer.spawnIframeTimer;
    s.dodgeIframeTimer = archer.dodgeIframeTimer;
    seenArchers.add(id);
  }
  for (const id of [...state.archers.keys()]) {
    if (!seenArchers.has(id)) state.archers.delete(id);
  }

  // Arrows: index existing by id, upsert / prune. Splice-from-tail keeps
  // the indices valid during removal.
  const arrowsByIdInState = new Map<string, ArrowState>();
  for (let i = 0; i < state.arrows.length; i++) {
    const s = state.arrows[i];
    if (s !== undefined) arrowsByIdInState.set(s.id, s);
  }
  const seenArrows = new Set<string>();
  for (const arrow of world.arrows) {
    let s = arrowsByIdInState.get(arrow.id);
    if (s === undefined) {
      s = new ArrowState();
      s.id = arrow.id;
      state.arrows.push(s);
    }
    s.posX = arrow.pos.x;
    s.posY = arrow.pos.y;
    s.velX = arrow.vel.x;
    s.velY = arrow.vel.y;
    s.ownerId = arrow.ownerId;
    s.status = arrow.status;
    s.groundedTimer = arrow.groundedTimer;
    seenArrows.add(arrow.id);
  }
  for (let i = state.arrows.length - 1; i >= 0; i--) {
    const s = state.arrows[i];
    if (s !== undefined && !seenArrows.has(s.id)) {
      state.arrows.splice(i, 1);
    }
  }
};

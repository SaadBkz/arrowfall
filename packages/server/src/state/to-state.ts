import type { World } from "@arrowfall/engine";
import { ArcherState } from "./archer-state.js";
import { ArrowState } from "./arrow-state.js";
import { ChestState } from "./chest-state.js";
import type { MatchState } from "./match-state.js";

// Mutate `state` in place to mirror `world`. Idempotent: calling it twice
// with the same World produces the same patch set on the second call
// (zero ops). Reuses existing ArcherState / ArrowState instances when ids
// match — only the changed scalar fields emit patches on the wire.
//
// Why mutate instead of returning a fresh state: @colyseus/schema tracks
// changes by object identity. Allocating a new ArcherState every frame
// would re-emit the full payload (and gradually leak ids on the client).
//
// `archerIdBySessionId` maps the room's session ids to engine archer
// slot ids (p1..p6). state.archers is keyed by sessionId — that lets a
// connected client look itself up via `room.sessionId` immediately.
// archer.id (the slot) stays in the schema for HUD color/role mapping.
//
// `lastClientTickBySessionId` (Phase 7) is the latest clientTick the
// room has applied for each session. Mirrored verbatim into
// state.lastInputTick so each client can ack its own pending inputs.
export const worldToMatchState = (
  world: World,
  state: MatchState,
  archerIdBySessionId: ReadonlyMap<string, string>,
  lastClientTickBySessionId: ReadonlyMap<string, number> = new Map(),
): void => {
  state.tick = world.tick;
  if (state.mapId !== world.map.id) {
    state.mapId = world.map.id;
  }

  // Archers: upsert by sessionId, then prune entries that no longer
  // map to a connected session. Iteration order is arbitrary — the
  // schema tracks per-key diffs.
  const seenSessions = new Set<string>();
  for (const [sessionId, archerId] of archerIdBySessionId) {
    const archer = world.archers.get(archerId);
    if (archer === undefined) continue; // stale mapping; skip defensively
    let s = state.archers.get(sessionId);
    if (s === undefined) {
      s = new ArcherState();
      s.id = archerId;
      state.archers.set(sessionId, s);
    }
    s.id = archerId;
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
    s.bombInventory = archer.bombInventory;
    s.drillInventory = archer.drillInventory;
    s.laserInventory = archer.laserInventory;
    s.hasShield = archer.hasShield;
    seenSessions.add(sessionId);
  }
  for (const sessionId of [...state.archers.keys()]) {
    if (!seenSessions.has(sessionId)) state.archers.delete(sessionId);
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
    s.arrowType = arrow.type;
    seenArrows.add(arrow.id);
  }
  for (let i = state.arrows.length - 1; i >= 0; i--) {
    const s = state.arrows[i];
    if (s !== undefined && !seenArrows.has(s.id)) {
      state.arrows.splice(i, 1);
    }
  }

  // Phase 9a — chests. Same upsert/prune pattern as arrows.
  const chestsByIdInState = new Map<string, ChestState>();
  for (let i = 0; i < state.chests.length; i++) {
    const s = state.chests[i];
    if (s !== undefined) chestsByIdInState.set(s.id, s);
  }
  const seenChests = new Set<string>();
  for (const chest of world.chests) {
    let s = chestsByIdInState.get(chest.id);
    if (s === undefined) {
      s = new ChestState();
      s.id = chest.id;
      state.chests.push(s);
    }
    s.posX = chest.pos.x;
    s.posY = chest.pos.y;
    s.status = chest.status;
    s.openTimer = chest.openTimer;
    s.openerId = chest.openerId ?? "";
    s.lootKind = chest.contents.kind;
    if (chest.contents.kind === "arrows") {
      s.lootType = chest.contents.type;
      s.lootCount = chest.contents.count;
    } else {
      // shield: lootType / lootCount are unused; keep stable defaults
      // so the wire patch doesn't churn when the chest is shield-bearing.
      s.lootType = "normal";
      s.lootCount = 0;
    }
    seenChests.add(chest.id);
  }
  for (let i = state.chests.length - 1; i >= 0; i--) {
    const s = state.chests[i];
    if (s !== undefined && !seenChests.has(s.id)) {
      state.chests.splice(i, 1);
    }
  }

  // lastInputTick: upsert per session, prune entries for sessions that
  // have left. Same idempotency contract as the rest of the mirror —
  // identical inputs produce zero patches on the second call.
  const seenTickSessions = new Set<string>();
  for (const [sessionId, clientTick] of lastClientTickBySessionId) {
    if (state.lastInputTick.get(sessionId) !== clientTick) {
      state.lastInputTick.set(sessionId, clientTick);
    }
    seenTickSessions.add(sessionId);
  }
  for (const sessionId of [...state.lastInputTick.keys()]) {
    if (!seenTickSessions.has(sessionId)) state.lastInputTick.delete(sessionId);
  }
};

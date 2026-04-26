import {
  ARCHER_HITBOX_H,
  type Archer,
  type Arrow,
  type ArrowType,
  type Chest,
  type ChestStatus,
  type World,
} from "@arrowfall/engine";
import type { MapData } from "@arrowfall/shared";
import type { ArcherState, ArrowState, ChestState, MatchState } from "./schema.js";

// Translate the wire schema into the engine's `World` shape so the
// existing Phase 4-5 renderers (archer.ts, arrow.ts, hud.ts,
// round-message.ts) can consume it unchanged.
//
// We fill in engine-internal fields (timers, prevBottom, etc.) with
// zeros — the renderers only read pos / vel / status / facing / alive
// / inventory / iframes / deathTimer. If a renderer ever starts
// reading e.g. dodgeTimer, we'll need to surface that field on the
// wire too; today it's an implementation detail of the server.
//
// `mapData` is fixed for the room lifetime (Phase 6 ships only
// arena-01) and provided by the client at connect time. The schema's
// `mapId` is used only for sanity-checking.

const archerFromState = (s: ArcherState): Archer => ({
  id: s.id,
  pos: { x: s.posX, y: s.posY },
  vel: { x: s.velX, y: s.velY },
  facing: (s.facing === "L" ? "L" : "R") as Archer["facing"],
  state: (s.state === "dodging" ? "dodging" : "idle") as Archer["state"],
  dodgeTimer: 0,
  dodgeIframeTimer: s.dodgeIframeTimer,
  dodgeCooldownTimer: 0,
  coyoteTimer: 0,
  jumpBufferTimer: 0,
  // Body height — fixed; the renderer doesn't read prevBottom but we
  // keep the engine type honest by computing it correctly.
  prevBottom: s.posY + ARCHER_HITBOX_H,
  inventory: s.inventory,
  shootCooldownTimer: 0,
  alive: s.alive,
  deathTimer: s.deathTimer,
  spawnIframeTimer: s.spawnIframeTimer,
  bombInventory: s.bombInventory,
});

const arrowTypeFromState = (raw: string): ArrowType =>
  raw === "bomb" ? "bomb" : "normal";

const arrowFromState = (s: ArrowState): Arrow => ({
  id: s.id,
  type: arrowTypeFromState(s.arrowType),
  pos: { x: s.posX, y: s.posY },
  vel: { x: s.velX, y: s.velY },
  ownerId: s.ownerId,
  status: (s.status === "grounded"
    ? "grounded"
    : s.status === "embedded"
      ? "embedded"
      : s.status === "exploding"
        ? "exploding"
        : "flying") as Arrow["status"],
  age: 0,
  groundedTimer: s.groundedTimer,
});

const chestStatusFromState = (raw: string): ChestStatus =>
  raw === "opening" ? "opening" : raw === "opened" ? "opened" : "closed";

const chestFromState = (s: ChestState): Chest => ({
  id: s.id,
  pos: { x: s.posX, y: s.posY },
  status: chestStatusFromState(s.status),
  openTimer: s.openTimer,
  openerId: s.openerId === "" ? null : s.openerId,
  contents: { type: arrowTypeFromState(s.lootType), count: s.lootCount },
});

// Reads the schema synchronously and produces a fresh World. Cheap
// (≤6 archers + ~10s of arrows on the wire); we do this once per
// render frame so the patches Colyseus applies are visible
// immediately. No need to subscribe to `onChange` — `onStateChange`
// fires the listener with the latest state and we re-render from it.
export const matchStateToWorld = (
  state: MatchState,
  mapData: MapData,
): World => {
  const archers = new Map<string, Archer>();
  // state.archers is keyed by sessionId on the wire; the renderers
  // expect archer.id (the slot id, p1..p6) as the Map key — that's how
  // colors are assigned (archerColorFor(id)) and HUD rows are listed.
  // Re-key here so the renderers stay agnostic to the network layer.
  //
  // Defensive `?.` against @colyseus/schema 3.x: the decoder
  // Object.create()s the state, bypassing our constructor defaults, so
  // a collection field stays undefined until the server emits a patch
  // touching it.
  state.archers?.forEach((archerSt: ArcherState) => {
    const a = archerFromState(archerSt);
    archers.set(a.id, a);
  });
  const arrows: Arrow[] = [];
  state.arrows?.forEach((arrowSt: ArrowState) => {
    arrows.push(arrowFromState(arrowSt));
  });
  const chests: Chest[] = [];
  state.chests?.forEach((chestSt: ChestState) => {
    chests.push(chestFromState(chestSt));
  });
  return {
    map: mapData,
    archers,
    arrows,
    chests,
    tick: state.tick ?? 0,
    events: [],
  };
};


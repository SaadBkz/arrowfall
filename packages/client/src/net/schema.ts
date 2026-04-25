import { ArraySchema, MapSchema, Schema, defineTypes } from "@colyseus/schema";

// Client-side mirror of the server's wire schema (packages/server/src/state).
// @colyseus/schema requires both ends to declare matching classes
// (same fields, same order, same primitive types) so the binary patches
// decode correctly. Drift = silent corruption — keep this file in lock-
// step with the server module.
//
// Why duplicate instead of sharing through @arrowfall/shared: shared is
// a no-dep package by contract. Pulling @colyseus/schema into shared
// would leak networking into engine + tests. The cost of duplication is
// ~30 lines that change once a phase.

export class ArcherState extends Schema {
  id = "";
  posX = 0;
  posY = 0;
  velX = 0;
  velY = 0;
  facing = "R";
  state = "idle";
  inventory = 0;
  alive = true;
  deathTimer = 0;
  spawnIframeTimer = 0;
  dodgeIframeTimer = 0;
}

defineTypes(ArcherState, {
  id: "string",
  posX: "number",
  posY: "number",
  velX: "number",
  velY: "number",
  facing: "string",
  state: "string",
  inventory: "uint8",
  alive: "boolean",
  deathTimer: "uint16",
  spawnIframeTimer: "uint16",
  dodgeIframeTimer: "uint16",
});

export class ArrowState extends Schema {
  id = "";
  posX = 0;
  posY = 0;
  velX = 0;
  velY = 0;
  ownerId = "";
  status = "flying";
  groundedTimer = 0;
}

defineTypes(ArrowState, {
  id: "string",
  posX: "number",
  posY: "number",
  velX: "number",
  velY: "number",
  ownerId: "string",
  status: "string",
  groundedTimer: "uint16",
});

export class MatchState extends Schema {
  tick = 0;
  mapId = "";
  archers = new MapSchema<ArcherState>();
  arrows = new ArraySchema<ArrowState>();
}

defineTypes(MatchState, {
  tick: "uint32",
  mapId: "string",
  archers: { map: ArcherState },
  arrows: [ArrowState],
});

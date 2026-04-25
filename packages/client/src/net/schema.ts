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
//
// `declare` keyword (not `!`) — under `useDefineForClassFields: true`
// (TS default for ES2022 targets) even definite-assignment field
// declarations emit Object.defineProperty calls that shadow the
// prototype getters/setters @colyseus/schema installs. Constructor-body
// assignments then bypass the schema's change tracking. `declare`
// emits no class field, so the prototype accessors stay intact.

export class ArcherState extends Schema {
  declare id: string;
  declare posX: number;
  declare posY: number;
  declare velX: number;
  declare velY: number;
  declare facing: string;
  declare state: string;
  declare inventory: number;
  declare alive: boolean;
  declare deathTimer: number;
  declare spawnIframeTimer: number;
  declare dodgeIframeTimer: number;

  constructor() {
    super();
    this.id = "";
    this.posX = 0;
    this.posY = 0;
    this.velX = 0;
    this.velY = 0;
    this.facing = "R";
    this.state = "idle";
    this.inventory = 0;
    this.alive = true;
    this.deathTimer = 0;
    this.spawnIframeTimer = 0;
    this.dodgeIframeTimer = 0;
  }
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
  declare id: string;
  declare posX: number;
  declare posY: number;
  declare velX: number;
  declare velY: number;
  declare ownerId: string;
  declare status: string;
  declare groundedTimer: number;

  constructor() {
    super();
    this.id = "";
    this.posX = 0;
    this.posY = 0;
    this.velX = 0;
    this.velY = 0;
    this.ownerId = "";
    this.status = "flying";
    this.groundedTimer = 0;
  }
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
  declare tick: number;
  declare mapId: string;
  declare archers: MapSchema<ArcherState>;
  declare arrows: ArraySchema<ArrowState>;

  constructor() {
    super();
    this.tick = 0;
    this.mapId = "";
    this.archers = new MapSchema<ArcherState>();
    this.arrows = new ArraySchema<ArrowState>();
  }
}

defineTypes(MatchState, {
  tick: "uint32",
  mapId: "string",
  archers: { map: ArcherState },
  arrows: [ArrowState],
});

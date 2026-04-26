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
  // Phase 9a — bomb arrows held (separate counter from `inventory`,
  // which is normal arrows only).
  declare bombInventory: number;

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
    this.bombInventory = 0;
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
  bombInventory: "uint8",
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
  // Phase 9a — "normal" | "bomb" (drives the renderer sprite + tint).
  declare arrowType: string;

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
    this.arrowType = "normal";
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
  arrowType: "string",
});

// Phase 9a — chest mirror (matches server/src/state/chest-state.ts).
export class ChestState extends Schema {
  declare id: string;
  declare posX: number;
  declare posY: number;
  declare status: string;
  declare openTimer: number;
  declare openerId: string;
  declare lootType: string;
  declare lootCount: number;

  constructor() {
    super();
    this.id = "";
    this.posX = 0;
    this.posY = 0;
    this.status = "closed";
    this.openTimer = 0;
    this.openerId = "";
    this.lootType = "normal";
    this.lootCount = 0;
  }
}

defineTypes(ChestState, {
  id: "string",
  posX: "number",
  posY: "number",
  status: "string",
  openTimer: "uint16",
  openerId: "string",
  lootType: "string",
  lootCount: "uint8",
});

export class MatchState extends Schema {
  declare tick: number;
  declare mapId: string;
  declare archers: MapSchema<ArcherState>;
  declare arrows: ArraySchema<ArrowState>;
  declare lastInputTick: MapSchema<number>;
  // Phase 9a.
  declare chests: ArraySchema<ChestState>;

  // Phase 8 — lobby + match flow. See packages/server/src/state/match-state.ts
  // for the field-by-field contract; the schemas MUST stay in lockstep.
  declare roomCode: string;
  declare phase: string;
  declare phaseTimer: number;
  declare roundNumber: number;
  declare targetWins: number;
  declare wins: MapSchema<number>;
  declare ready: MapSchema<boolean>;
  declare roundWinnerSessionId: string;
  declare matchWinnerSessionId: string;

  constructor() {
    super();
    this.tick = 0;
    this.mapId = "";
    this.archers = new MapSchema<ArcherState>();
    this.arrows = new ArraySchema<ArrowState>();
    this.lastInputTick = new MapSchema<number>();
    this.chests = new ArraySchema<ChestState>();

    this.roomCode = "";
    this.phase = "lobby";
    this.phaseTimer = 0;
    this.roundNumber = 0;
    this.targetWins = 3;
    this.wins = new MapSchema<number>();
    this.ready = new MapSchema<boolean>();
    this.roundWinnerSessionId = "";
    this.matchWinnerSessionId = "";
  }
}

defineTypes(MatchState, {
  tick: "uint32",
  mapId: "string",
  archers: { map: ArcherState },
  arrows: [ArrowState],
  lastInputTick: { map: "uint32" },
  chests: [ChestState],

  roomCode: "string",
  phase: "string",
  phaseTimer: "uint16",
  roundNumber: "uint8",
  targetWins: "uint8",
  wins: { map: "uint8" },
  ready: { map: "boolean" },
  roundWinnerSessionId: "string",
  matchWinnerSessionId: "string",
});

// Discriminated union of phases — mirrors the server's `phase` strings.
// Use isPhase() in the client to narrow before reading.
export type MatchPhase = "lobby" | "playing" | "round-end" | "match-end";

const KNOWN_PHASES: ReadonlySet<string> = new Set([
  "lobby",
  "playing",
  "round-end",
  "match-end",
]);

export const isMatchPhase = (raw: string): raw is MatchPhase => KNOWN_PHASES.has(raw);

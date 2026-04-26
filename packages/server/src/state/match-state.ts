import { ArraySchema, MapSchema, Schema, defineTypes } from "@colyseus/schema";
import { ArcherState } from "./archer-state.js";
import { ArrowState } from "./arrow-state.js";

// Top-level wire state. Replicated to every connected client.
//
// `archers` is a MapSchema keyed by sessionId so adds/removes patch
// minimally (one map op per join/leave instead of full re-emission).
// archer.id holds the engine slot id (p1..p6) for HUD/colour mapping.
//
// `arrows` is ArraySchema — id-keyed lookup happens in `worldToMatchState`
// via a side index.
//
// `tick` and `mapId` are emitted once per round / never (mapId is fixed
// for the room lifetime); both are cheap to keep on the wire for debug.
//
// `lastInputTick` (Phase 7) — keyed by sessionId, holds the latest
// `clientTick` the room has applied for that session. Lets each client
// reconcile its locally predicted world.
//
// Phase 8 fields — lobby + match flow:
//   - `roomCode` — 4-letter code (the join handle for other browsers).
//   - `phase` — "lobby" | "playing" | "round-end" | "match-end".
//   - `phaseTimer` — frames remaining in the current freeze (round-end
//     pauses on the win screen, match-end pauses before returning to
//     lobby). Zero outside those phases.
//   - `roundNumber` — 0 in lobby, 1+ during playing/round-end. Bumps at
//     the start of each new round.
//   - `wins` — sessionId → number of round wins. Resets on a fresh
//     match; persists across rounds within a match. Survives leave —
//     a disconnected player keeps their score until the match resets,
//     so a stat panel can still show "X had 2 wins when they left".
//   - `targetWins` — first to this number wins the match (default 3).
//   - `roundWinnerSessionId` — set during round-end / match-end. Empty
//     string means draw.
//   - `matchWinnerSessionId` — set during match-end only.
//   - `ready` — lobby-only. Sessions toggle ready; once every connected
//     session is ready and the roster has >= 2 players, the match starts.
//
// `declare` keyword (not `!`) — see archer-state.ts for the full
// rationale. TL;DR: under `useDefineForClassFields: true` even
// definite-assignment field declarations emit Object.defineProperty
// calls that shadow the prototype getter/setter @colyseus/schema
// installs.
export class MatchState extends Schema {
  declare tick: number;
  declare mapId: string;
  declare archers: MapSchema<ArcherState>;
  declare arrows: ArraySchema<ArrowState>;
  declare lastInputTick: MapSchema<number>;

  // Phase 8.
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

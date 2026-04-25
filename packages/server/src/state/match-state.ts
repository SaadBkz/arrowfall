import { ArraySchema, MapSchema, Schema, defineTypes } from "@colyseus/schema";
import { ArcherState } from "./archer-state.js";
import { ArrowState } from "./arrow-state.js";

// Top-level wire state. Replicated to every connected client.
//
// `archers` is a MapSchema keyed by sessionId so adds/removes patch
// minimally (one map op per join/leave instead of full re-emission).
//
// `arrows` is ArraySchema — id-keyed lookup happens in `worldToMatchState`
// via a side index. Could be MapSchema, but keeping the spec's prescribed
// shape — Phase 6 doesn't need keyed access on the client.
//
// `tick` and `mapId` are emitted once per round / never (mapId is fixed
// for the room lifetime); both are cheap to keep on the wire for debug.
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

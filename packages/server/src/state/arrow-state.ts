import { Schema, defineTypes } from "@colyseus/schema";

// Wire schema for one arrow. Same flattening rationale as ArcherState.
// `age` is omitted — the client doesn't need it for rendering, only the
// status (flying/grounded/embedded) drives the visual.
//
// Phase 9a — `arrowType` field exposes the engine's ArrowType to the
// client renderer ("normal" | "bomb"). Status "exploding" is harvested
// by stepWorld within a single tick and never appears on the wire, so
// the client only ever sees the normal three statuses.
//
// `declare` (not `!`) — see archer-state.ts for the full rationale.
export class ArrowState extends Schema {
  declare id: string;
  declare posX: number;
  declare posY: number;
  declare velX: number;
  declare velY: number;
  declare ownerId: string;
  declare status: string; // "flying" | "grounded" | "embedded"
  declare groundedTimer: number;
  declare arrowType: string; // Phase 9a — "normal" | "bomb"

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

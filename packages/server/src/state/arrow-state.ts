import { Schema, defineTypes } from "@colyseus/schema";

// Wire schema for one arrow. Same flattening rationale as ArcherState.
// `age` is omitted — the client doesn't need it for rendering, only the
// status (flying/grounded/embedded) drives the visual.
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

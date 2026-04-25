import { Schema, defineTypes } from "@colyseus/schema";

// Wire schema for one arrow. Same flattening rationale as ArcherState.
// `age` is omitted — the client doesn't need it for rendering, only the
// status (flying/grounded/embedded) drives the visual.
export class ArrowState extends Schema {
  id = "";
  posX = 0;
  posY = 0;
  velX = 0;
  velY = 0;
  ownerId = "";
  status = "flying"; // "flying" | "grounded" | "embedded"
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

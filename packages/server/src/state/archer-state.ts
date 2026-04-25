import { Schema, defineTypes } from "@colyseus/schema";

// Wire schema for one archer. Mirrors ONLY what the renderer needs to draw
// + the few state bits the HUD reads (alive, inventory, iframe timers for
// the catch glow). Internal engine timers (jumpBuffer, coyote,
// dodgeCooldown, prevBottom, etc.) stay server-side — they're physics
// implementation details, not visible state.
//
// Vec2 fields are flattened (`posX` / `posY` instead of nested `pos: Vec2`)
// because @colyseus/schema 3.x only patches @type-decorated structures
// efficiently. A nested non-Schema object would force a full re-emit on
// every change.
export class ArcherState extends Schema {
  id = "";
  posX = 0;
  posY = 0;
  velX = 0;
  velY = 0;
  facing = "R"; // "L" | "R"
  state = "idle"; // "idle" | "dodging"
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

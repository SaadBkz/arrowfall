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
//
// IMPORTANT — `declare` (NOT `!`):
// Under `useDefineForClassFields: true` (TS default for ES2022 targets),
// even a definite-assignment field (`field!: T;`) compiles to
// `Object.defineProperty(this, 'field', {value: undefined, writable: true})`
// at instance construction. That OVERRIDES the prototype getter/setter
// @colyseus/schema installs via `Schema.initialize` — so `~childType`
// never propagates to MapSchema/ArraySchema and encodeAll throws
// `Cannot read properties of undefined`.
// `declare` tells TS the field exists at runtime but emits NO class
// field — the prototype's accessors stay intact and constructor-body
// assignments fire the setters correctly.
export class ArcherState extends Schema {
  declare id: string;
  declare posX: number;
  declare posY: number;
  declare velX: number;
  declare velY: number;
  declare facing: string; // "L" | "R"
  declare state: string; // "idle" | "dodging"
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

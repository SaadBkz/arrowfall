import { Schema, defineTypes } from "@colyseus/schema";

// Phase 9a/9b — wire schema for one chest. Mirrors @arrowfall/engine's
// Chest type with the same field-flattening convention as ArcherState
// (Vec2 → posX/posY) so @colyseus/schema can patch primitives only.
//
// ChestContents (engine) is a discriminated union over `kind`:
//   - { kind: "arrows", type: ArrowType, count: number }
//   - { kind: "shield" }
// We flatten that into three fields:
//   - lootKind  : "arrows" | "shield"
//   - lootType  : ArrowType — meaningful only when lootKind = "arrows"
//   - lootCount : uint8     — meaningful only when lootKind = "arrows"
// Both clients and the engine ignore lootType/lootCount when
// lootKind === "shield".
//
// `openerId` is the empty string when no opener is set yet (closed
// chest); MapSchema sentinels need a defined value, not null.
//
// `declare` (not `!`) — see archer-state.ts.
export class ChestState extends Schema {
  declare id: string;
  declare posX: number;
  declare posY: number;
  declare status: string; // "closed" | "opening" | "opened"
  declare openTimer: number;
  declare openerId: string; // "" if none
  declare lootKind: string; // "arrows" | "shield"
  declare lootType: string; // ArrowType (only meaningful when lootKind="arrows")
  declare lootCount: number;

  constructor() {
    super();
    this.id = "";
    this.posX = 0;
    this.posY = 0;
    this.status = "closed";
    this.openTimer = 0;
    this.openerId = "";
    this.lootKind = "arrows";
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
  lootKind: "string",
  lootType: "string",
  lootCount: "uint8",
});

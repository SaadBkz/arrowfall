// Spec §8.4 — inputs sent at 60 Hz.
// `jump` and `dodge` are *edges* (true only on the frame the key is pressed,
// consumed once by the engine). `left/right/up/down/jumpHeld` are *levels*
// (true while held). The caller (client predicition / server authoritative)
// is responsible for producing the correct edge vs. level values frame by
// frame. Phase 2 omits `shoot` and `aimDirection` — those land in Phase 3.
export type ArcherInput = {
  readonly left: boolean;
  readonly right: boolean;
  readonly up: boolean;
  readonly down: boolean;
  readonly jump: boolean;
  readonly dodge: boolean;
  readonly jumpHeld: boolean;
};

export const NEUTRAL_INPUT: ArcherInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  dodge: false,
  jumpHeld: false,
};

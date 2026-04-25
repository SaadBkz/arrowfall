import { type Direction8 } from "../math/direction.js";

// Spec §8.4 — inputs sent at 60 Hz.
// `jump`, `dodge` and `shoot` are *edges* (true only on the frame the key is
// pressed, consumed once by the engine). `left/right/up/down/jumpHeld` are
// *levels* (true while held). `aimDirection` is the player's held aim, in 8
// compass directions, independent from walk: null = no aim held (default,
// shooting fires horizontally toward `facing`). The caller (client
// prediction / server authoritative) is responsible for producing correct
// edge vs. level values frame by frame.
export type ArcherInput = {
  readonly left: boolean;
  readonly right: boolean;
  readonly up: boolean;
  readonly down: boolean;
  readonly jump: boolean;
  readonly dodge: boolean;
  readonly jumpHeld: boolean;
  readonly shoot: boolean;
  readonly aimDirection: Direction8 | null;
};

export const NEUTRAL_INPUT: ArcherInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  dodge: false,
  jumpHeld: false,
  shoot: false,
  aimDirection: null,
};

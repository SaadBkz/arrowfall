import {
  type ArcherInput,
  DODGE_COOLDOWN_FRAMES,
  DODGE_DURATION_FRAMES,
  DODGE_INVINCIBILITY_FRAMES,
  DODGE_SPEED,
  directionToVec2,
  inputDirection,
} from "@arrowfall/shared";
import { type Archer } from "./types.js";

// State machine:
//   idle  -- input.dodge edge & cooldown==0 --> dodging (set timers, vel)
//   dodging -- dodgeTimer reaches 0          --> idle (vel preserved)
//
// During the dodge, gravity does not apply (see stepArcher) — the
// trajectory is pure horizontal/diagonal. This is intentional, it
// matches TowerFall and is the foundation for reliable arrow catches
// during the iframe window.
//
// dodgeIframeTimer is exposed for Phase 3 (catch/iframe vs. arrows).
// No test in this phase consumes it beyond verifying it decrements.
export const applyDodge = (archer: Archer, input: ArcherInput): Archer => {
  if (
    archer.state === "idle" &&
    input.dodge &&
    archer.dodgeCooldownTimer === 0
  ) {
    const requestedDir = inputDirection(input);
    const unit =
      requestedDir !== null
        ? directionToVec2(requestedDir)
        : { x: archer.facing === "R" ? 1 : -1, y: 0 };

    return {
      ...archer,
      vel: { x: unit.x * DODGE_SPEED, y: unit.y * DODGE_SPEED },
      state: "dodging",
      dodgeTimer: DODGE_DURATION_FRAMES,
      dodgeIframeTimer: DODGE_INVINCIBILITY_FRAMES,
      dodgeCooldownTimer: DODGE_COOLDOWN_FRAMES,
    };
  }

  if (archer.state === "dodging") {
    const dodgeTimer = archer.dodgeTimer - 1;
    if (dodgeTimer <= 0) {
      return { ...archer, state: "idle", dodgeTimer: 0 };
    }
    return { ...archer, dodgeTimer };
  }

  return archer;
};

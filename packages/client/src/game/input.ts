import { type ArcherInput, inputDirection } from "@arrowfall/shared";

// Pure key state — what's currently down and what edges fired this frame.
// Decoupled from the DOM so a test can build one by hand and feed it into
// `keyStateToArcherInput`.
export type KeyState = {
  // Levels — true while the key is held.
  readonly left: boolean;
  readonly right: boolean;
  readonly up: boolean;
  readonly down: boolean;
  readonly jumpHeld: boolean;
  // Edges — true ONLY on the frame the key was pressed. Caller must clear
  // them after consuming via `consumeEdges()`.
  readonly jump: boolean;
  readonly dodge: boolean;
  readonly shoot: boolean;
  readonly reset: boolean;
};

export const NEUTRAL_KEY_STATE: KeyState = {
  left: false,
  right: false,
  up: false,
  down: false,
  jumpHeld: false,
  jump: false,
  dodge: false,
  shoot: false,
  reset: false,
};

// Map physical key codes (`event.code`, layout-independent) to logical
// actions. Arrow keys are listed first because the user is FR/AZERTY:
// `KeyA` (Q in AZERTY) and `KeyZ` (W in AZERTY) are convenient extras
// rather than the default. Multiple codes may resolve to the same action.
const LEVEL_BINDINGS: Readonly<Record<string, keyof KeyState>> = {
  ArrowLeft: "left",
  KeyA: "left",
  KeyQ: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "up",
  KeyW: "up",
  KeyZ: "up",
  ArrowDown: "down",
  KeyS: "down",
  Space: "jumpHeld",
};

const EDGE_BINDINGS: Readonly<Record<string, keyof KeyState>> = {
  Space: "jump",
  KeyJ: "shoot",
  KeyK: "dodge",
  KeyR: "reset",
};

// Codes whose default browser behaviour (page scroll) we want to suppress
// while the game has focus.
const PREVENT_DEFAULT_CODES: ReadonlySet<string> = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
]);

// Pure mapper: `KeyState → ArcherInput`. Aim direction is derived from the
// dpad, matching the engine convention used in `inputDirection` (opposite
// keys cancel). The shared helper does the work — we don't reimplement.
export const keyStateToArcherInput = (s: KeyState): ArcherInput => {
  const partial = {
    left: s.left,
    right: s.right,
    up: s.up,
    down: s.down,
    jump: s.jump,
    dodge: s.dodge,
    jumpHeld: s.jumpHeld,
    shoot: s.shoot,
    aimDirection: null,
  } satisfies ArcherInput;
  return { ...partial, aimDirection: inputDirection(partial) };
};

// Owns DOM listeners and a mutable `KeyState`. Construct once per Game
// session, call `attach(target)` to wire keydown/keyup/blur, and
// `dispose()` to remove them. `snapshot()` returns the current input;
// `consumeEdges()` clears edge bits AFTER the engine has stepped (so a
// single press doesn't fire `shoot`/`dodge`/`jump` on multiple ticks).
export class KeyboardInput {
  private state: KeyState = { ...NEUTRAL_KEY_STATE };
  private detach: (() => void) | null = null;

  attach(target: Window): void {
    if (this.detach !== null) return;

    const onKeyDown = (e: KeyboardEvent): void => {
      if (PREVENT_DEFAULT_CODES.has(e.code)) e.preventDefault();
      // Auto-repeat fires keydown over and over while a key is held; we
      // ignore those for edge bindings (so `shoot` isn't re-armed every
      // ~30 ms) but accept them for level bindings (idempotent set).
      const level = LEVEL_BINDINGS[e.code];
      if (level !== undefined) {
        this.state = { ...this.state, [level]: true };
      }
      if (!e.repeat) {
        const edge = EDGE_BINDINGS[e.code];
        if (edge !== undefined) {
          this.state = { ...this.state, [edge]: true };
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent): void => {
      const level = LEVEL_BINDINGS[e.code];
      if (level !== undefined) {
        this.state = { ...this.state, [level]: false };
      }
      // Edge bindings don't need a keyup — they're cleared by consumeEdges.
    };

    const onBlur = (): void => {
      // Critical: an alt-tab while a direction is held leaves the key
      // "stuck" otherwise. Reset everything to a neutral snapshot.
      this.state = { ...NEUTRAL_KEY_STATE };
    };

    target.addEventListener("keydown", onKeyDown);
    target.addEventListener("keyup", onKeyUp);
    target.addEventListener("blur", onBlur);

    this.detach = (): void => {
      target.removeEventListener("keydown", onKeyDown);
      target.removeEventListener("keyup", onKeyUp);
      target.removeEventListener("blur", onBlur);
    };
  }

  dispose(): void {
    this.detach?.();
    this.detach = null;
    this.state = { ...NEUTRAL_KEY_STATE };
  }

  snapshotKeyState(): KeyState {
    return this.state;
  }

  snapshot(): ArcherInput {
    return keyStateToArcherInput(this.state);
  }

  // Acknowledge edge inputs after stepWorld so they don't carry over into
  // the next tick. Called by the game loop right after stepWorld.
  // Reset is NOT cleared here — it has its own consumeReset() lifecycle
  // because it's a frame-level event (not tick-level).
  consumeEdges(): void {
    if (this.state.jump || this.state.dodge || this.state.shoot) {
      this.state = { ...this.state, jump: false, dodge: false, shoot: false };
    }
  }

  // Polled separately from `snapshot()` so it's available outside the
  // ArcherInput payload (Reset isn't an archer action).
  consumeReset(): boolean {
    if (!this.state.reset) return false;
    this.state = { ...this.state, reset: false };
    return true;
  }
}

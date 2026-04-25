import { type ArcherInput, inputDirection } from "@arrowfall/shared";

// Pure key state — what's currently down and what edges fired this frame
// for ONE player. Hot-seat keeps a `Map<playerId, KeyState>` (one entry
// per binding). Decoupled from the DOM so a test can build one by hand
// and feed it into `keyStateToArcherInput`.
export type KeyState = {
  // Levels — true while the key is held.
  readonly left: boolean;
  readonly right: boolean;
  readonly up: boolean;
  readonly down: boolean;
  readonly jumpHeld: boolean;
  // Edges — true ONLY on the frame the key was pressed. Caller must clear
  // them after consuming via `consumeEdges(playerId)`.
  readonly jump: boolean;
  readonly dodge: boolean;
  readonly shoot: boolean;
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
};

// Per-player binding table. `event.code` keys are layout-independent
// (KeyA = the physical key labelled "A" on QWERTY = "Q" on AZERTY).
export type PlayerBinding = {
  readonly id: string;
  readonly levels: Readonly<Record<string, keyof KeyState>>;
  readonly edges: Readonly<Record<string, keyof KeyState>>;
};

// Player slots, in id order. Phase 5 uses p1+p2 by default; p3/p4 are
// pre-wired so PLAYER_COUNT can be bumped without touching this file.
//
// Note on AZERTY: the user types ZQSD; those keys are at the WASD
// physical positions on QWERTY, which is what `event.code` reports
// (KeyW/KeyA/KeyS/KeyD). So the same binding feels right on either
// layout — that's the whole point of `event.code`.
//
// `KeyR` was previously the global reset; reset has moved to
// `Backspace` (see RESET_CODES) to free KeyR for P2's shoot.
export const PLAYER_BINDINGS: ReadonlyArray<PlayerBinding> = [
  {
    id: "p1",
    levels: {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
      Space: "jumpHeld",
    },
    edges: {
      Space: "jump",
      KeyJ: "shoot",
      KeyK: "dodge",
    },
  },
  {
    id: "p2",
    levels: {
      KeyA: "left",
      KeyD: "right",
      KeyW: "up",
      KeyS: "down",
      KeyF: "jumpHeld",
    },
    edges: {
      KeyF: "jump",
      KeyR: "shoot",
      KeyT: "dodge",
    },
  },
  // not validated for ergonomics — gamepads recommended (Phase 11)
  {
    id: "p3",
    levels: {
      Numpad4: "left",
      Numpad6: "right",
      Numpad8: "up",
      Numpad5: "down",
      Numpad0: "jumpHeld",
    },
    edges: {
      Numpad0: "jump",
      NumpadAdd: "shoot",
      NumpadEnter: "dodge",
    },
  },
  // not validated for ergonomics — gamepads recommended (Phase 11)
  {
    id: "p4",
    levels: {
      Semicolon: "left",
      Quote: "right",
      BracketLeft: "up",
      BracketRight: "down",
      Slash: "jumpHeld",
    },
    edges: {
      Slash: "jump",
      Backslash: "shoot",
      Period: "dodge",
    },
  },
];

// Reset is global — any player can trigger it (or anyone watching).
// Lives outside player bindings so it never ghosts with an action key.
export const RESET_CODES: ReadonlySet<string> = new Set(["Backspace"]);

// Codes that always misbehave by default in a browser regardless of
// who's bound to them — page scroll for arrows / Space, navigation for
// Backspace. Per-binding codes are added on top of this in attach().
const ALWAYS_PREVENT_DEFAULT_CODES: ReadonlySet<string> = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
  "Backspace",
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

// Owns DOM listeners and one mutable `KeyState` per bound player.
// `attach(target)` wires keydown/keyup/blur once for the whole table;
// `dispose()` unwires. `snapshot(playerId)` returns the current input;
// `consumeEdges(playerId)` clears edge bits AFTER the engine has stepped
// (so a single press doesn't fire `shoot`/`dodge`/`jump` on multiple
// ticks). `consumeReset()` is global.
export class KeyboardInput {
  private readonly bindings: ReadonlyArray<PlayerBinding>;
  private readonly states: Map<string, KeyState>;
  private readonly preventDefaultCodes: ReadonlySet<string>;
  private resetEdge = false;
  private detach: (() => void) | null = null;

  constructor(bindings: ReadonlyArray<PlayerBinding> = PLAYER_BINDINGS) {
    this.bindings = bindings;
    this.states = new Map();
    const pd = new Set<string>(ALWAYS_PREVENT_DEFAULT_CODES);
    for (const b of bindings) {
      this.states.set(b.id, { ...NEUTRAL_KEY_STATE });
      for (const code of Object.keys(b.levels)) pd.add(code);
      for (const code of Object.keys(b.edges)) pd.add(code);
    }
    this.preventDefaultCodes = pd;
  }

  attach(target: Window): void {
    if (this.detach !== null) return;

    const onKeyDown = (e: KeyboardEvent): void => {
      if (this.preventDefaultCodes.has(e.code)) e.preventDefault();

      // Levels — accept auto-repeat (idempotent set).
      for (const b of this.bindings) {
        const lvl = b.levels[e.code];
        if (lvl !== undefined) {
          const prev = this.states.get(b.id)!;
          this.states.set(b.id, { ...prev, [lvl]: true });
        }
      }

      if (!e.repeat) {
        // Per-player edges.
        for (const b of this.bindings) {
          const ed = b.edges[e.code];
          if (ed !== undefined) {
            const prev = this.states.get(b.id)!;
            this.states.set(b.id, { ...prev, [ed]: true });
          }
        }
        // Global reset edge.
        if (RESET_CODES.has(e.code)) {
          this.resetEdge = true;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent): void => {
      for (const b of this.bindings) {
        const lvl = b.levels[e.code];
        if (lvl !== undefined) {
          const prev = this.states.get(b.id)!;
          this.states.set(b.id, { ...prev, [lvl]: false });
        }
      }
      // Edge bindings don't need a keyup — they're cleared by
      // consumeEdges/consumeReset.
    };

    const onBlur = (): void => {
      // Critical: an alt-tab while a direction is held leaves the key
      // "stuck" otherwise. Reset every player's slate to neutral.
      for (const id of this.states.keys()) {
        this.states.set(id, { ...NEUTRAL_KEY_STATE });
      }
      this.resetEdge = false;
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
    for (const id of this.states.keys()) {
      this.states.set(id, { ...NEUTRAL_KEY_STATE });
    }
    this.resetEdge = false;
  }

  snapshotKeyState(playerId: string): KeyState {
    const s = this.states.get(playerId);
    if (s === undefined) {
      throw new Error(`KeyboardInput: no bindings registered for player "${playerId}"`);
    }
    return s;
  }

  snapshot(playerId: string): ArcherInput {
    return keyStateToArcherInput(this.snapshotKeyState(playerId));
  }

  // Acknowledge edge inputs after stepWorld so they don't carry over into
  // the next tick. Called by the game loop right after stepWorld for
  // every active player.
  consumeEdges(playerId: string): void {
    const s = this.states.get(playerId);
    if (s === undefined) return;
    if (s.jump || s.dodge || s.shoot) {
      this.states.set(playerId, { ...s, jump: false, dodge: false, shoot: false });
    }
  }

  // Polled separately from `snapshot()` — Reset isn't an archer action
  // and lives at frame level (not tick level) since it tears the World
  // down before the next step.
  consumeReset(): boolean {
    if (!this.resetEdge) return false;
    this.resetEdge = false;
    return true;
  }
}

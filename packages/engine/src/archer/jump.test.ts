import { describe, expect, it } from "vitest";
import {
  type ArcherInput,
  type MapData,
  type MapJson,
  JUMP_BUFFER_FRAMES,
  JUMP_GRACE_FRAMES,
  JUMP_VELOCITY,
  NEUTRAL_INPUT,
} from "@arrowfall/shared";
import { parseMap } from "../tilemap/loader.js";
import { applyJump, type JumpEnv } from "./jump.js";
import { stepArcher } from "./step.js";
import { type Archer, createArcher } from "./types.js";

const blank = (): string[] => Array.from({ length: 17 }, () => ".".repeat(30));

const place = (rows: string[], y: number, x: number, ch: string): string[] => {
  const row = rows[y];
  if (row === undefined) throw new Error(`row ${y} missing`);
  const out = rows.slice();
  out[y] = row.slice(0, x) + ch + row.slice(x + 1);
  return out;
};

const mkMap = (rows: string[]): MapData => {
  const json: MapJson = { id: "t", name: "T", width: 30, height: 17, rows };
  return parseMap(json);
};

const env = (onGround: boolean, wallL = false, wallR = false): JumpEnv => ({
  onGround,
  touchingWallL: wallL,
  touchingWallR: wallR,
});

// Mirrors stepArcher's end-of-frame timer decrement so isolated applyJump
// tests don't drift from the orchestrator's bookkeeping. Coyote and
// buffer only decrement on frames where they were *not* refilled.
const tickTimers = (
  archer: Archer,
  onGround: boolean,
  jumpPressed: boolean,
): Archer => ({
  ...archer,
  coyoteTimer: onGround
    ? archer.coyoteTimer
    : Math.max(0, archer.coyoteTimer - 1),
  jumpBufferTimer: jumpPressed
    ? archer.jumpBufferTimer
    : Math.max(0, archer.jumpBufferTimer - 1),
});

const jumpInput: ArcherInput = { ...NEUTRAL_INPUT, jump: true };

describe("applyJump — ground jump", () => {
  it("sets vel.y = JUMP_VELOCITY when buffer + coyote both warm", () => {
    let a = createArcher("x", { x: 100, y: 100 });
    a = applyJump(a, jumpInput, env(true));
    expect(a.vel.y).toBe(JUMP_VELOCITY);
    expect(a.coyoteTimer).toBe(0);
    expect(a.jumpBufferTimer).toBe(0);
  });

  it("does not jump in mid-air without coyote left", () => {
    let a = createArcher("x", { x: 100, y: 100 });
    a = applyJump(a, jumpInput, env(false));
    expect(a.vel.y).toBe(0);
    expect(a.jumpBufferTimer).toBe(JUMP_BUFFER_FRAMES);
  });
});

describe("applyJump — coyote window", () => {
  it("succeeds JUMP_GRACE_FRAMES frames after leaving the ground", () => {
    // One grounded frame to charge coyote.
    let a = createArcher("x", { x: 100, y: 100 });
    a = applyJump(a, NEUTRAL_INPUT, env(true));
    a = tickTimers(a, true, false);
    expect(a.coyoteTimer).toBe(JUMP_GRACE_FRAMES);

    // GRACE-1 frames in air: coyote ticks down to 1.
    for (let k = 1; k < JUMP_GRACE_FRAMES; k++) {
      a = applyJump(a, NEUTRAL_INPUT, env(false));
      a = tickTimers(a, false, false);
    }
    expect(a.coyoteTimer).toBe(1);

    // Frame GRACE in air: press jump, should still consume the window.
    a = applyJump(a, jumpInput, env(false));
    expect(a.vel.y).toBe(JUMP_VELOCITY);
  });

  it("fails JUMP_GRACE_FRAMES + 1 frames after leaving", () => {
    let a = createArcher("x", { x: 100, y: 100 });
    a = applyJump(a, NEUTRAL_INPUT, env(true));
    a = tickTimers(a, true, false);

    for (let k = 1; k <= JUMP_GRACE_FRAMES; k++) {
      a = applyJump(a, NEUTRAL_INPUT, env(false));
      a = tickTimers(a, false, false);
    }
    expect(a.coyoteTimer).toBe(0);

    a = applyJump(a, jumpInput, env(false));
    expect(a.vel.y).toBe(0);
  });
});

describe("applyJump — buffered jump", () => {
  it("press in-air, land at frame BUFFER → consumes the buffer", () => {
    let a = createArcher("x", { x: 100, y: 100 });
    // Frame 0: in air, press jump.
    a = applyJump(a, jumpInput, env(false));
    a = tickTimers(a, false, true);
    expect(a.jumpBufferTimer).toBe(JUMP_BUFFER_FRAMES);

    // BUFFER-1 frames in air, no press.
    for (let k = 1; k < JUMP_BUFFER_FRAMES; k++) {
      a = applyJump(a, NEUTRAL_INPUT, env(false));
      a = tickTimers(a, false, false);
    }
    expect(a.jumpBufferTimer).toBe(1);

    // Frame BUFFER: lands. No fresh press but the buffer is still warm.
    a = applyJump(a, NEUTRAL_INPUT, env(true));
    expect(a.vel.y).toBe(JUMP_VELOCITY);
  });

  it("press in-air, land at frame BUFFER+1 → buffer expired", () => {
    let a = createArcher("x", { x: 100, y: 100 });
    a = applyJump(a, jumpInput, env(false));
    a = tickTimers(a, false, true);

    for (let k = 1; k <= JUMP_BUFFER_FRAMES; k++) {
      a = applyJump(a, NEUTRAL_INPUT, env(false));
      a = tickTimers(a, false, false);
    }
    expect(a.jumpBufferTimer).toBe(0);

    a = applyJump(a, NEUTRAL_INPUT, env(true));
    expect(a.vel.y).toBe(0);
  });
});

describe("stepArcher — jump height", () => {
  // Spec §2: GRAVITY = 0.30, JUMP_VELOCITY = -4.5. Order in stepArcher is
  // applyJump (vy=-4.5) → gravity (+0.3) → move. So vy at end of frame 0
  // is -4.2; subsequent in-air frames add 0.3. Apex (vy reaches 0) is
  // hit at frame 14, where total displacement is:
  //   Σ_{k=0..14} (-4.2 + 0.3·k) = 15·(-4.2) + 0.3·(14·15/2) = -31.5
  it("rises by exactly 31.5 px before falling (semi-implicit Euler)", () => {
    let rows = blank();
    // SOLID floor across cols 5..10, row 13 (top y=208).
    for (let c = 5; c <= 10; c++) rows = place(rows, 13, c, "#");
    const map = mkMap(rows);

    // Body bottom flush with the platform's top: y = 208 - 11 = 197.
    let a = createArcher("x", { x: 100, y: 197 });
    a = stepArcher(a, jumpInput, map);
    for (let i = 1; i <= 13; i++) a = stepArcher(a, NEUTRAL_INPUT, map);
    expect(a.pos.y).toBeCloseTo(197 - 31.5, 9);

    // One more frame: still at apex (vy=0 at frame 14).
    a = stepArcher(a, NEUTRAL_INPUT, map);
    expect(a.pos.y).toBeCloseTo(197 - 31.5, 9);
  });
});

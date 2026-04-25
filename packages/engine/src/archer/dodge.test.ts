import { describe, expect, it } from "vitest";
import {
  type ArcherInput,
  type MapData,
  type MapJson,
  DODGE_COOLDOWN_FRAMES,
  DODGE_DURATION_FRAMES,
  DODGE_INVINCIBILITY_FRAMES,
  DODGE_SPEED,
  NEUTRAL_INPUT,
} from "@arrowfall/shared";
import { parseMap } from "../tilemap/loader.js";
import { applyDodge } from "./dodge.js";
import { stepArcher } from "./step.js";
import { createArcher } from "./types.js";

const blankMap = (): MapData => {
  const json: MapJson = {
    id: "blank",
    name: "Blank",
    width: 30,
    height: 17,
    rows: Array.from({ length: 17 }, () => ".".repeat(30)),
  };
  return parseMap(json);
};

const dodgeE: ArcherInput = { ...NEUTRAL_INPUT, dodge: true, right: true };
const dodgeNE: ArcherInput = {
  ...NEUTRAL_INPUT,
  dodge: true,
  right: true,
  up: true,
};
const dodgeOnly: ArcherInput = { ...NEUTRAL_INPUT, dodge: true };

describe("applyDodge — initiation", () => {
  it("E direction: vel = (DODGE_SPEED, 0) and arms all dodge timers", () => {
    let a = createArcher("x", { x: 100, y: 100 });
    a = applyDodge(a, dodgeE);
    expect(a.state).toBe("dodging");
    expect(a.vel.x).toBe(DODGE_SPEED);
    expect(a.vel.y).toBe(0);
    expect(a.dodgeTimer).toBe(DODGE_DURATION_FRAMES);
    expect(a.dodgeIframeTimer).toBe(DODGE_INVINCIBILITY_FRAMES);
    expect(a.dodgeCooldownTimer).toBe(DODGE_COOLDOWN_FRAMES);
  });

  it("NE diagonal: components normalised to keep |vel| = DODGE_SPEED", () => {
    let a = createArcher("x", { x: 100, y: 100 });
    a = applyDodge(a, dodgeNE);
    const len = Math.sqrt(a.vel.x * a.vel.x + a.vel.y * a.vel.y);
    expect(len).toBeCloseTo(DODGE_SPEED, 12);
    expect(a.vel.x).toBeGreaterThan(0);
    expect(a.vel.y).toBeLessThan(0); // up
  });

  it("falls back to facing when no direction is held", () => {
    let a = createArcher("x", { x: 100, y: 100 }, "L");
    a = applyDodge(a, dodgeOnly);
    expect(a.vel.x).toBe(-DODGE_SPEED);
    expect(a.vel.y).toBe(0);
  });
});

describe("applyDodge — cooldown", () => {
  it("a second dodge during cooldown is ignored", () => {
    let a = createArcher("x", { x: 100, y: 100 });
    a = applyDodge(a, dodgeE);
    expect(a.state).toBe("dodging");

    // Run out the dodge duration without ticking cooldown to 0.
    for (let i = 0; i < DODGE_DURATION_FRAMES; i++) {
      a = applyDodge(a, NEUTRAL_INPUT);
    }
    expect(a.state).toBe("idle");
    // Cooldown still warm — second dodge press must do nothing to vel.
    const before = a.vel;
    a = { ...a, dodgeCooldownTimer: 5 };
    a = applyDodge(a, dodgeE);
    expect(a.state).toBe("idle");
    expect(a.vel).toEqual(before);
  });

  it("a second dodge after cooldown re-arms the dodge", () => {
    let a = createArcher("x", { x: 100, y: 100 });
    a = applyDodge(a, dodgeE);
    a = { ...a, dodgeCooldownTimer: 0, state: "idle", dodgeTimer: 0 };
    a = applyDodge(a, dodgeE);
    expect(a.state).toBe("dodging");
    expect(a.dodgeCooldownTimer).toBe(DODGE_COOLDOWN_FRAMES);
  });
});

describe("stepArcher — dodge integration", () => {
  it("gravity does not apply during the dodge (vy stays constant)", () => {
    const map = blankMap();
    let a = createArcher("x", { x: 100, y: 100 });
    // Frame 0: trigger horizontal dodge.
    a = stepArcher(a, dodgeE, map);
    expect(a.state).toBe("dodging");
    expect(a.vel.y).toBe(0);
    // Subsequent frames: vy must remain 0 (no gravity) until dodge ends.
    for (let i = 1; i < DODGE_DURATION_FRAMES; i++) {
      a = stepArcher(a, NEUTRAL_INPUT, map);
      expect(a.vel.y).toBe(0);
    }
  });

  it("iframe timer decrements one per frame", () => {
    const map = blankMap();
    let a = createArcher("x", { x: 100, y: 100 });
    a = stepArcher(a, dodgeE, map);
    expect(a.dodgeIframeTimer).toBe(DODGE_INVINCIBILITY_FRAMES - 1);
    a = stepArcher(a, NEUTRAL_INPUT, map);
    expect(a.dodgeIframeTimer).toBe(DODGE_INVINCIBILITY_FRAMES - 2);
  });

  it("returns to idle after DODGE_DURATION_FRAMES follow-up frames", () => {
    const map = blankMap();
    let a = createArcher("x", { x: 100, y: 100 });
    a = stepArcher(a, dodgeE, map);
    // Frame 0 initiated dodge with timer = DURATION. Each subsequent
    // frame decrements; the DURATION-th follow-up frame transitions
    // state back to idle.
    for (let i = 0; i < DODGE_DURATION_FRAMES; i++) {
      a = stepArcher(a, NEUTRAL_INPUT, map);
    }
    expect(a.state).toBe("idle");
  });
});

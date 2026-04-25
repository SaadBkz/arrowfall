import { describe, expect, it } from "vitest";
import {
  type ArcherInput,
  ARROW_SPEED,
  NEUTRAL_INPUT,
  SHOOT_COOLDOWN_FRAMES,
  SPAWN_ARROW_COUNT,
} from "@arrowfall/shared";
import { applyShoot } from "./shoot.js";
import { type Archer, createArcher } from "./types.js";

const idleArcher = (id = "p1"): Archer => ({
  ...createArcher(id, { x: 100, y: 100 }, "R"),
  spawnIframeTimer: 0,
});

const shootInput = (over: Partial<ArcherInput> = {}): ArcherInput => ({
  ...NEUTRAL_INPUT,
  shoot: true,
  ...over,
});

describe("applyShoot — basic cases", () => {
  it("fires when alive + idle + cooldown 0 + inventory > 0; sets cooldown and decrements inventory", () => {
    const a = idleArcher();
    const result = applyShoot(a, shootInput(), "0");
    expect(result.newArrow).not.toBeNull();
    expect(result.archer.inventory).toBe(SPAWN_ARROW_COUNT - 1);
    expect(result.archer.shootCooldownTimer).toBe(SHOOT_COOLDOWN_FRAMES);
  });

  it("rejects shot during cooldown; inventory and cooldown untouched", () => {
    const a: Archer = { ...idleArcher(), shootCooldownTimer: 5 };
    const result = applyShoot(a, shootInput(), "0");
    expect(result.newArrow).toBeNull();
    expect(result.archer.inventory).toBe(SPAWN_ARROW_COUNT);
    expect(result.archer.shootCooldownTimer).toBe(5);
  });

  it("rejects shot when inventory is empty; no cooldown is consumed", () => {
    const a: Archer = { ...idleArcher(), inventory: 0 };
    const result = applyShoot(a, shootInput(), "0");
    expect(result.newArrow).toBeNull();
    expect(result.archer.shootCooldownTimer).toBe(0);
    expect(result.archer.inventory).toBe(0);
  });

  it("rejects shot when not idle (e.g. dodging)", () => {
    const a: Archer = { ...idleArcher(), state: "dodging", dodgeTimer: 5 };
    const result = applyShoot(a, shootInput(), "0");
    expect(result.newArrow).toBeNull();
  });

  it("rejects shot when input.shoot edge is false", () => {
    const a = idleArcher();
    const result = applyShoot(a, NEUTRAL_INPUT, "0");
    expect(result.newArrow).toBeNull();
  });

  it("rejects shot when archer is dead", () => {
    const a: Archer = { ...idleArcher(), alive: false };
    const result = applyShoot(a, shootInput(), "0");
    expect(result.newArrow).toBeNull();
  });
});

describe("applyShoot — direction", () => {
  it("aimDirection = null + facing 'L' → horizontal-left, length = ARROW_SPEED", () => {
    const a = { ...idleArcher(), facing: "L" as const };
    const result = applyShoot(a, shootInput(), "0");
    expect(result.newArrow).not.toBeNull();
    expect(result.newArrow!.vel.x).toBe(-ARROW_SPEED);
    expect(result.newArrow!.vel.y).toBe(0);
  });

  it("aimDirection = null + facing 'R' → horizontal-right", () => {
    const a = idleArcher();
    const result = applyShoot(a, shootInput(), "0");
    expect(result.newArrow!.vel.x).toBe(ARROW_SPEED);
    expect(result.newArrow!.vel.y).toBe(0);
  });

  it("aimDirection = 'NE' → diagonal up-right, |vel| = ARROW_SPEED to 1e-12", () => {
    const a = idleArcher();
    const result = applyShoot(a, shootInput({ aimDirection: "NE" }), "0");
    const vel = result.newArrow!.vel;
    expect(vel.x).toBeGreaterThan(0);
    expect(vel.y).toBeLessThan(0); // NE is up-right; up = -y
    const len = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
    expect(len).toBeCloseTo(ARROW_SPEED, 12);
  });
});

describe("applyShoot — id stability", () => {
  it("two identical inputs with the same idSuffix produce identical arrow ids", () => {
    const a = idleArcher();
    const r1 = applyShoot(a, shootInput(), "42");
    const r2 = applyShoot(a, shootInput(), "42");
    expect(r1.newArrow!.id).toBe(r2.newArrow!.id);
    expect(r1.newArrow!.id).toContain("p1-arrow-42");
  });
});

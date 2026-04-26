import {
  LASER_ARROW_SPEED,
  LASER_LIFETIME_FRAMES,
  LASER_MAX_BOUNCES,
  type MapJson,
} from "@arrowfall/shared";
import { describe, expect, it } from "vitest";
import { parseMap } from "../tilemap/loader.js";
import { stepArrow } from "./step.js";
import { type Arrow } from "./types.js";

// Closed box: SOLID border on all four sides, empty in the middle.
// A laser bouncing inside this box will hit walls repeatedly without
// ever escaping, so we can count bounces deterministically.
const boxMapJson: MapJson = {
  id: "laser-box",
  name: "laser-box",
  width: 30,
  height: 17,
  rows: [
    "##############################", // 0
    "#............................#", // 1
    "#............................#", // 2
    "#............................#", // 3
    "#............................#", // 4
    "#............................#", // 5
    "#............................#", // 6
    "#............................#", // 7
    "#............................#", // 8
    "#............................#", // 9
    "#............................#", // 10
    "#............................#", // 11
    "#............................#", // 12
    "#............................#", // 13
    "#............................#", // 14
    "#............................#", // 15
    "##############################", // 16
  ],
};

const map = parseMap(boxMapJson);

const laserFlying = (
  x: number,
  y: number,
  vx: number,
  vy: number = 0,
): Arrow => ({
  id: "test-laser",
  type: "laser",
  pos: { x, y },
  vel: { x: vx, y: vy },
  ownerId: "p1",
  status: "flying",
  age: 0,
  groundedTimer: 0,
  piercesUsed: 0,
  bouncesUsed: 0,
});

describe("laser arrow — physics profile", () => {
  it("LASER constants come from the spec (speed=7, max=7 bounces, lifetime=30f)", () => {
    expect(LASER_ARROW_SPEED).toBe(7.0);
    expect(LASER_MAX_BOUNCES).toBe(7);
    expect(LASER_LIFETIME_FRAMES).toBe(30);
  });

  it("ignores gravity (purely horizontal motion stays horizontal)", () => {
    // Mid-box, fired east. After 3 frames vy must still be 0 (no
    // gravity for lasers). A normal arrow with the same setup would
    // have vy ≈ 0.9 after 3 frames.
    let laser = laserFlying(64, 128, LASER_ARROW_SPEED);
    for (let i = 0; i < 3; i++) {
      laser = stepArrow(laser, map);
      expect(laser.vel.y).toBe(0);
    }
    expect(laser.pos.y).toBe(128);
  });
});

describe("laser arrow — bouncing", () => {
  it("reflects vx on a vertical wall hit and bumps bouncesUsed", () => {
    // Fire east near the right wall. Frame 1: hits col 29 (x=464 east
    // edge) with vx=7 from x=460, sweep clamps + reflects to vx=-7.
    let laser = laserFlying(450, 128, LASER_ARROW_SPEED);
    let bouncedAt: number | null = null;
    for (let f = 1; f <= 5; f++) {
      const before = laser;
      laser = stepArrow(laser, map);
      if (laser.bouncesUsed > before.bouncesUsed) {
        bouncedAt = f;
        expect(laser.vel.x).toBe(-LASER_ARROW_SPEED);
        expect(laser.vel.y).toBe(0);
        break;
      }
    }
    expect(bouncedAt).not.toBeNull();
    expect(laser.bouncesUsed).toBe(1);
    expect(laser.status).toBe("flying");
  });

  it("despawns (status='exploding') the bounce that exceeds LASER_MAX_BOUNCES", () => {
    // Force-feed a laser already at LASER_MAX_BOUNCES bounces and
    // about to hit a wall: the next bounce attempt must despawn.
    const eastBound = laserFlying(450, 128, LASER_ARROW_SPEED);
    const exhausted: Arrow = { ...eastBound, bouncesUsed: LASER_MAX_BOUNCES };
    // Step until the wall is hit. With vx=7 from x=450, frame 1 lands
    // at x=457 (still flying — col 29 east edge at x=464 not yet
    // crossed). Frame 2 would clamp to x=456 and want to bounce.
    let arrow = exhausted;
    let despawned = false;
    for (let f = 1; f <= 5; f++) {
      arrow = stepArrow(arrow, map);
      if (arrow.status === "exploding") {
        despawned = true;
        break;
      }
    }
    expect(despawned).toBe(true);
  });

  it("despawns after LASER_LIFETIME_FRAMES regardless of bounce count", () => {
    // Laser hovers in mid-air with no walls in reach. Step 30 times;
    // on the 30th the lifetime check trips and flips it to exploding.
    let laser = laserFlying(64, 128, 0); // stationary — won't ever bounce
    for (let i = 0; i < LASER_LIFETIME_FRAMES - 1; i++) {
      laser = stepArrow(laser, map);
      expect(laser.status).toBe("flying");
    }
    laser = stepArrow(laser, map);
    expect(laser.status).toBe("exploding");
    expect(laser.age).toBe(LASER_LIFETIME_FRAMES);
  });

  it("vertical bounce (ceiling/floor) reflects vy and not vx", () => {
    // Fire north in the box, near the top. With vy=-7 from y=20,
    // frame 1: y=13 (still inside row 0 wall? row 0 spans y∈[0,16)).
    // Sweep clamps to y=16 (row 0 bottom edge) with hit "ceiling" →
    // reflect vy to +7.
    let laser = laserFlying(128, 20, 0, -LASER_ARROW_SPEED);
    let bouncedAt: number | null = null;
    for (let f = 1; f <= 5; f++) {
      const before = laser;
      laser = stepArrow(laser, map);
      if (laser.bouncesUsed > before.bouncesUsed) {
        bouncedAt = f;
        expect(laser.vel.y).toBe(LASER_ARROW_SPEED);
        expect(laser.vel.x).toBe(0);
        break;
      }
    }
    expect(bouncedAt).not.toBeNull();
  });
});

import {
  ARENA_HEIGHT_PX,
  ARENA_WIDTH_PX,
  BOMB_FUSE_FRAMES,
  type MapJson,
} from "@arrowfall/shared";
import { describe, expect, it } from "vitest";
import { parseMap } from "../tilemap/loader.js";
import { stepArrow } from "./step.js";
import { type Arrow } from "./types.js";

// Open arena with a single solid floor at the bottom row, so a flying
// bomb can either auto-detonate (fuse) or hit a wall — both code paths.
const openMapJson: MapJson = {
  id: "bomb-test",
  name: "bomb-test",
  width: 30,
  height: 17,
  rows: [
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "##############################",
  ],
};

const map = parseMap(openMapJson);

const makeBomb = (overrides: Partial<Arrow> = {}): Arrow => ({
  id: "test-bomb",
  type: "bomb",
  pos: { x: ARENA_WIDTH_PX / 2, y: 32 },
  vel: { x: 0, y: 0 },
  ownerId: "p1",
  status: "flying",
  age: 0,
  groundedTimer: 0,
  ...overrides,
});

describe("bomb arrow — fuse", () => {
  it("transitions to status=exploding the frame the fuse expires", () => {
    // age starts at 0; after BOMB_FUSE_FRAMES - 1 calls to stepArrow,
    // age = BOMB_FUSE_FRAMES - 1 (still flying), then one more call
    // makes age = BOMB_FUSE_FRAMES → exploding.
    let bomb = makeBomb({ vel: { x: 0, y: 0 } }); // hover, no movement
    for (let i = 0; i < BOMB_FUSE_FRAMES - 1; i++) {
      bomb = stepArrow(bomb, map);
    }
    // Note: stepArrow applies gravity + sweep before checking the fuse,
    // so a hovering bomb may move; we don't care about position here.
    expect(bomb.status).toBe("flying");
    bomb = stepArrow(bomb, map);
    expect(bomb.status).toBe("exploding");
    expect(bomb.age).toBe(BOMB_FUSE_FRAMES);
    expect(bomb.vel).toEqual({ x: 0, y: 0 });
  });

  it("status=exploding is idempotent under further stepArrow calls", () => {
    const bomb = makeBomb({ status: "exploding", age: BOMB_FUSE_FRAMES });
    const next = stepArrow(bomb, map);
    expect(next.status).toBe("exploding");
    expect(next.age).toBe(bomb.age + 1);
    expect(next.pos).toEqual(bomb.pos);
  });
});

describe("bomb arrow — wall hit", () => {
  it("flips to exploding when it hits a SOLID floor (instead of grounded)", () => {
    // Floor row 16, top edge y=256. Bomb height 2 → its bottom is
    // pos.y+2. Place it 4px above the floor and use vy=4 (=MAX_FALL_SPEED)
    // so the next sweep lands it exactly on the floor.
    const bomb = makeBomb({
      pos: { x: ARENA_WIDTH_PX / 2, y: ARENA_HEIGHT_PX - 18 },
      vel: { x: 0, y: 4 },
    });
    const next = stepArrow(bomb, map);
    expect(next.status).toBe("exploding");
    expect(next.vel).toEqual({ x: 0, y: 0 });
  });

  it("normal arrow with the same trajectory grounds (sanity — proves wall logic is bomb-specific)", () => {
    const arrow: Arrow = {
      id: "control",
      type: "normal",
      pos: { x: ARENA_WIDTH_PX / 2, y: ARENA_HEIGHT_PX - 18 },
      vel: { x: 0, y: 4 },
      ownerId: "p1",
      status: "flying",
      age: 0,
      groundedTimer: 0,
    };
    const next = stepArrow(arrow, map);
    expect(next.status).toBe("grounded");
  });
});

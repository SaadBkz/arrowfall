import { describe, expect, it } from "vitest";
import { type AABB, type MapData, type MapJson, TILE_SIZE } from "@arrowfall/shared";
import { parseMap } from "../tilemap/loader.js";
import {
  HITBOX_H,
  HITBOX_W,
  isOnGround,
  isTouchingWall,
  moveAndCollide,
  sweepX,
  sweepY,
} from "./collide.js";

const blank = (): string[] => Array.from({ length: 17 }, () => ".".repeat(30));

const place = (rows: string[], y: number, x: number, ch: string): string[] => {
  const row = rows[y];
  if (row === undefined) throw new Error(`row ${y} missing`);
  const out = rows.slice();
  out[y] = row.slice(0, x) + ch + row.slice(x + 1);
  return out;
};

const mkMap = (rows: string[]): MapData => {
  const json: MapJson = {
    id: "test",
    name: "Test",
    width: 30,
    height: 17,
    rows,
  };
  return parseMap(json);
};

const body = (x: number, y: number, w = HITBOX_W, h = HITBOX_H): AABB => ({
  x,
  y,
  w,
  h,
});

describe("sweepX", () => {
  it("returns endX with hit=false in empty space", () => {
    const map = mkMap(blank());
    const r = sweepX(map, body(100, 100), 10);
    expect(r.x).toBe(110);
    expect(r.hit).toBe(false);
  });

  it("snaps flush against the first SOLID column when moving right", () => {
    // SOLID at col 8 (x = 128..144), body row 6 (y = 96..107).
    let rows = blank();
    rows = place(rows, 6, 8, "#");
    const map = mkMap(rows);
    // Body at x=100, w=8 → right edge 108 (col 6). dx=+30 → target right 138.
    const r = sweepX(map, body(100, 96), 30);
    expect(r.hit).toBe(true);
    // Snapped flush against col 8 left edge: right = 8 * TILE_SIZE = 128.
    expect(r.x).toBe(128 - HITBOX_W);
  });

  it("snaps flush against the first SOLID column when moving left", () => {
    let rows = blank();
    rows = place(rows, 6, 5, "#"); // SOLID at col 5 (x = 80..96).
    const map = mkMap(rows);
    // Body at x=120 → left edge 120 (col 7). dx=-30 → target left 90.
    const r = sweepX(map, body(120, 96), -30);
    expect(r.hit).toBe(true);
    // Snapped flush against col 5 right edge = 6 * TILE_SIZE = 96.
    expect(r.x).toBe(6 * TILE_SIZE);
  });

  it("ignores JUMPTHRU on the X axis (passable laterally)", () => {
    let rows = blank();
    rows = place(rows, 6, 8, "-"); // JUMPTHRU.
    const map = mkMap(rows);
    const r = sweepX(map, body(100, 96), 30);
    expect(r.hit).toBe(false);
    expect(r.x).toBe(130);
  });

  it("detects SOLID across the right wrap seam", () => {
    let rows = blank();
    rows = place(rows, 6, 0, "#"); // SOLID at col 0 — appears at col 30 (= 0) when wrapping.
    const map = mkMap(rows);
    // Body at x=470 (col 29), dx=+15 → target x=485, right=493 → cols [29, 30 wrap=0].
    const r = sweepX(map, body(470, 96), 15);
    expect(r.hit).toBe(true);
    // Snapped flush against col 30 left edge (absolute pixel 480), so right=480, x=472.
    expect(r.x).toBe(480 - HITBOX_W);
  });
});

describe("sweepY", () => {
  it("returns endY with hit=none in empty space", () => {
    const map = mkMap(blank());
    const r = sweepY(map, body(100, 100), 5, 100 + HITBOX_H);
    expect(r.y).toBe(105);
    expect(r.hit).toBe("none");
  });

  it("lands on a SOLID tile (hit=ground)", () => {
    let rows = blank();
    rows = place(rows, 8, 6, "#"); // SOLID at row 8 (y = 128..144).
    const map = mkMap(rows);
    // Body at y=100 → bottom 111 (row 6). dy=+30 → target bottom 141.
    const r = sweepY(map, body(96, 100), 30, 100 + HITBOX_H);
    expect(r.hit).toBe("ground");
    // Snapped flush: bottom = 8 * TILE_SIZE = 128, y = 128 - h.
    expect(r.y).toBe(128 - HITBOX_H);
  });

  it("bonks against a SOLID ceiling (hit=ceiling)", () => {
    let rows = blank();
    rows = place(rows, 5, 6, "#"); // SOLID at row 5 (y = 80..96).
    const map = mkMap(rows);
    // Body at y=120, dy=-30 → target y=90.
    const r = sweepY(map, body(96, 120), -30, 120 + HITBOX_H);
    expect(r.hit).toBe("ceiling");
    // Snapped flush: top = 6 * TILE_SIZE = 96.
    expect(r.y).toBe(6 * TILE_SIZE);
  });
});

describe("sweepY — JUMPTHRU semantics", () => {
  it("solid when descending and prevBottom was at or above the platform's top", () => {
    let rows = blank();
    rows = place(rows, 8, 6, "-");
    const map = mkMap(rows);
    // prevBottom = 128 = row 8's top → at edge counts as "above".
    const r = sweepY(map, body(96, 117), 5, 128);
    expect(r.hit).toBe("ground");
    expect(r.y).toBe(128 - HITBOX_H);
  });

  it("passable when descending but prevBottom was already below the platform's top", () => {
    let rows = blank();
    rows = place(rows, 8, 6, "-");
    const map = mkMap(rows);
    // prevBottom = 130 (already inside the JUMPTHRU's row) → passable.
    const r = sweepY(map, body(119, 119), 5, 130);
    expect(r.hit).toBe("none");
    expect(r.y).toBe(124);
  });

  it("always passable when ascending (dy < 0)", () => {
    let rows = blank();
    rows = place(rows, 8, 6, "-");
    const map = mkMap(rows);
    // Body below the JUMPTHRU, jumping up through it.
    const r = sweepY(map, body(96, 145), -10, 145 + HITBOX_H);
    expect(r.hit).toBe("none");
    expect(r.y).toBe(135);
  });
});

describe("moveAndCollide", () => {
  it("composes X then Y so a body slides along a wall while falling", () => {
    let rows = blank();
    // SOLID column at col 8 spanning the body's vertical range (rows 6-7
    // for the body at y=100, h=11). The X sweep stops the body flush
    // against col 8; Y is then free in col 7 below the body.
    rows = place(rows, 6, 8, "#");
    rows = place(rows, 7, 8, "#");
    const map = mkMap(rows);
    const start = body(100, 100);
    const r = moveAndCollide(map, start, 30, 5, 100 + HITBOX_H);
    expect(r.hitX).toBe(true);
    expect(r.aabb.x).toBe(128 - HITBOX_W);
    expect(r.aabb.y).toBe(105);
    expect(r.hitY).toBe("none");
  });
});

describe("isOnGround", () => {
  it("true when the body's bottom is flush with a SOLID tile", () => {
    let rows = blank();
    rows = place(rows, 10, 6, "#"); // SOLID, top y = 160.
    const map = mkMap(rows);
    expect(isOnGround(map, body(96, 160 - HITBOX_H))).toBe(true);
  });

  it("true when flush with the top of a JUMPTHRU", () => {
    let rows = blank();
    rows = place(rows, 10, 6, "-");
    const map = mkMap(rows);
    expect(isOnGround(map, body(96, 160 - HITBOX_H))).toBe(true);
  });

  it("false in mid-air", () => {
    const map = mkMap(blank());
    expect(isOnGround(map, body(100, 50))).toBe(false);
  });

  it("false when the JUMPTHRU is below but the body isn't resting on its top", () => {
    let rows = blank();
    rows = place(rows, 10, 6, "-");
    const map = mkMap(rows);
    // Body bottom at y=158 → 2 px above the JUMPTHRU top.
    expect(isOnGround(map, body(96, 158 - HITBOX_H))).toBe(false);
  });
});

describe("isTouchingWall", () => {
  it("true on the L side when flush against a SOLID column", () => {
    let rows = blank();
    rows = place(rows, 10, 5, "#"); // SOLID col 5 → right edge x = 96.
    const map = mkMap(rows);
    // Body left edge at x=96 (touching col 5).
    expect(isTouchingWall(map, body(96, 156), "L")).toBe(true);
    expect(isTouchingWall(map, body(96, 156), "R")).toBe(false);
  });

  it("true on the R side when flush against a SOLID column", () => {
    let rows = blank();
    rows = place(rows, 10, 8, "#"); // SOLID col 8 → left edge x = 128.
    const map = mkMap(rows);
    // Body right edge at x=128 → x = 128 - HITBOX_W = 120.
    expect(isTouchingWall(map, body(128 - HITBOX_W, 156), "R")).toBe(true);
    expect(isTouchingWall(map, body(128 - HITBOX_W, 156), "L")).toBe(false);
  });

  it("false against JUMPTHRU (not a wall)", () => {
    let rows = blank();
    rows = place(rows, 10, 5, "-");
    const map = mkMap(rows);
    expect(isTouchingWall(map, body(96, 156), "L")).toBe(false);
  });
});

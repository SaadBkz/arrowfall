import { describe, expect, it } from "vitest";
import {
  aabbContainsPoint,
  aabbIntersects,
  add,
  approachZero,
  clamp,
  directionToVec2,
  dot,
  equals,
  length,
  lengthSq,
  lerp,
  neg,
  normalize,
  scale,
  sign,
  sub,
  vec2,
  type AABB,
} from "@arrowfall/shared";

describe("Vec2 helpers (pure, immutable)", () => {
  it("add / sub / scale / neg do not mutate inputs", () => {
    const a = vec2(1, 2);
    const b = vec2(3, 4);
    expect(add(a, b)).toEqual({ x: 4, y: 6 });
    expect(sub(a, b)).toEqual({ x: -2, y: -2 });
    expect(scale(a, 3)).toEqual({ x: 3, y: 6 });
    expect(neg(a)).toEqual({ x: -1, y: -2 });
    expect(a).toEqual({ x: 1, y: 2 });
    expect(b).toEqual({ x: 3, y: 4 });
  });

  it("dot / length / lengthSq", () => {
    expect(dot(vec2(1, 2), vec2(3, 4))).toBe(11);
    expect(lengthSq(vec2(3, 4))).toBe(25);
    expect(length(vec2(3, 4))).toBe(5);
  });

  it("normalize unit-vectors a non-zero vector", () => {
    const n = normalize(vec2(3, 4));
    expect(equals(n, vec2(0.6, 0.8))).toBe(true);
    expect(length(n)).toBeCloseTo(1, 12);
  });

  it("normalize returns the zero vector instead of NaN for the zero input", () => {
    expect(normalize(vec2(0, 0))).toEqual({ x: 0, y: 0 });
  });

  it("equals respects the epsilon argument", () => {
    expect(equals(vec2(0, 0), vec2(1e-12, -1e-12))).toBe(true);
    expect(equals(vec2(0, 0), vec2(0.001, 0), 1e-9)).toBe(false);
    expect(equals(vec2(0, 0), vec2(0.001, 0), 1e-2)).toBe(true);
  });
});

describe("AABB intersection (touching ≠ intersecting)", () => {
  it("overlapping rects intersect", () => {
    const a: AABB = { x: 0, y: 0, w: 10, h: 10 };
    const b: AABB = { x: 5, y: 5, w: 10, h: 10 };
    expect(aabbIntersects(a, b)).toBe(true);
  });

  // Convention documented in shared/math/aabb.ts: edges that merely touch
  // do NOT count as intersecting. Keeps "resting on a tile" unambiguous.
  it("touching edges do not intersect", () => {
    const a: AABB = { x: 0, y: 0, w: 10, h: 10 };
    const right: AABB = { x: 10, y: 0, w: 10, h: 10 };
    const below: AABB = { x: 0, y: 10, w: 10, h: 10 };
    expect(aabbIntersects(a, right)).toBe(false);
    expect(aabbIntersects(a, below)).toBe(false);
  });

  it("disjoint rects do not intersect", () => {
    const a: AABB = { x: 0, y: 0, w: 10, h: 10 };
    const b: AABB = { x: 100, y: 100, w: 10, h: 10 };
    expect(aabbIntersects(a, b)).toBe(false);
  });

  it("aabbContainsPoint is half-open on right/bottom edges", () => {
    const a: AABB = { x: 0, y: 0, w: 10, h: 10 };
    expect(aabbContainsPoint(a, vec2(0, 0))).toBe(true);
    expect(aabbContainsPoint(a, vec2(5, 5))).toBe(true);
    expect(aabbContainsPoint(a, vec2(10, 5))).toBe(false);
    expect(aabbContainsPoint(a, vec2(5, 10))).toBe(false);
  });
});

describe("scalar helpers", () => {
  it("clamp", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it("lerp", () => {
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(-10, 10, 0.5)).toBe(0);
  });

  it("sign", () => {
    expect(sign(5)).toBe(1);
    expect(sign(-5)).toBe(-1);
    expect(sign(0)).toBe(0);
  });

  it("approachZero never overshoots", () => {
    expect(approachZero(5, 2)).toBe(3);
    expect(approachZero(5, 10)).toBe(0);
    expect(approachZero(-5, 2)).toBe(-3);
    expect(approachZero(-5, 10)).toBe(0);
    expect(approachZero(0, 5)).toBe(0);
  });
});

describe("Direction8", () => {
  it("cardinals are unit vectors", () => {
    expect(directionToVec2("N")).toEqual({ x: 0, y: -1 });
    expect(directionToVec2("E")).toEqual({ x: 1, y: 0 });
    expect(directionToVec2("S")).toEqual({ x: 0, y: 1 });
    expect(directionToVec2("W")).toEqual({ x: -1, y: 0 });
  });

  it("diagonals are normalised (length ≈ 1)", () => {
    for (const d of ["NE", "SE", "SW", "NW"] as const) {
      expect(length(directionToVec2(d))).toBeCloseTo(1, 12);
    }
  });
});

export type Vec2 = { readonly x: number; readonly y: number };

export const vec2 = (x: number, y: number): Vec2 => ({ x, y });

export const ZERO: Vec2 = { x: 0, y: 0 };

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });

export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });

export const neg = (a: Vec2): Vec2 => ({ x: -a.x, y: -a.y });

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;

export const lengthSq = (a: Vec2): number => a.x * a.x + a.y * a.y;

export const length = (a: Vec2): number => Math.sqrt(lengthSq(a));

export const normalize = (a: Vec2): Vec2 => {
  const len = length(a);
  if (len === 0) return ZERO;
  return { x: a.x / len, y: a.y / len };
};

const DEFAULT_EPSILON = 1e-9;

export const equals = (a: Vec2, b: Vec2, eps: number = DEFAULT_EPSILON): boolean =>
  Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;

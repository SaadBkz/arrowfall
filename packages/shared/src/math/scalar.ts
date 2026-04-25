export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const sign = (value: number): -1 | 0 | 1 => (value > 0 ? 1 : value < 0 ? -1 : 0);

// Move `value` toward 0 by at most `delta`, never overshooting. Used by friction.
export const approachZero = (value: number, delta: number): number => {
  if (value > 0) return Math.max(0, value - delta);
  if (value < 0) return Math.min(0, value + delta);
  return 0;
};

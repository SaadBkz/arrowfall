// Phase 10 — Canvas helpers shared by every painter. Keeps painters
// terse: a painter takes a CanvasRenderingContext2D + arguments and
// emits pixels via px()/rect()/etc.
//
// Determinism: all randomness goes through mulberry32 seeded by the
// caller. Two calls with the same seed produce the same image — useful
// for visual snapshot tests later and for stable variant selection
// (e.g. tile decoration index).

export type Painter2D = CanvasRenderingContext2D;

// Detached canvas. Used both for individual sprite frames and for
// composing larger spritesheets. Default to crisp pixel rendering
// (no subpixel smoothing).
export const newCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (ctx === null) throw new Error("2d context unavailable");
  ctx.imageSmoothingEnabled = false;
  return c;
};

export const ctx2d = (c: HTMLCanvasElement): Painter2D => {
  const g = c.getContext("2d");
  if (g === null) throw new Error("2d context unavailable");
  g.imageSmoothingEnabled = false;
  return g;
};

// Draw a single pixel. Pixi sprites with imageSmoothingEnabled=false
// will preserve the crispness up to 4× scale.
export const px = (g: Painter2D, x: number, y: number, color: string): void => {
  g.fillStyle = color;
  g.fillRect(x, y, 1, 1);
};

// Filled rect. Width/height are inclusive — fillRect already operates
// in device pixels so this matches.
export const rect = (
  g: Painter2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void => {
  g.fillStyle = color;
  g.fillRect(x, y, w, h);
};

// 1-pixel-thick outlined rect (no fill).
export const outline = (
  g: Painter2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void => {
  rect(g, x, y, w, 1, color);
  rect(g, x, y + h - 1, w, 1, color);
  rect(g, x, y, 1, h, color);
  rect(g, x + w - 1, y, 1, h, color);
};

// Mulberry32 PRNG — small, deterministic, good enough for visual
// variants. Seed in (caller chooses); next() in [0, 1).
export const mulberry32 = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Hash a tile coord + theme into a stable seed. Produces variant
// indices that don't shift across runs (so a player's mental map of
// where the rune is doesn't break frame-to-frame).
export const tileSeed = (theme: string, tx: number, ty: number): number => {
  let h = 0x811c9dc5; // FNV-1a basis
  for (let i = 0; i < theme.length; i++) {
    h = Math.imul(h ^ theme.charCodeAt(i), 0x01000193);
  }
  h = Math.imul(h ^ (tx * 374761393), 0x01000193);
  h = Math.imul(h ^ (ty * 668265263), 0x01000193);
  return (h ^ (h >>> 15)) >>> 0;
};

// Composite one canvas onto another at (dx, dy). Used to bake a frame
// into a spritesheet.
export const blit = (
  dst: Painter2D,
  src: HTMLCanvasElement,
  dx: number,
  dy: number,
): void => {
  dst.drawImage(src, dx, dy);
};

// Fill a rectangle with a vertical gradient between two hex colors.
// Used for sky / void backgrounds.
export const vGradient = (
  g: Painter2D,
  x: number,
  y: number,
  w: number,
  h: number,
  topHex: string,
  bottomHex: string,
): void => {
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, topHex);
  grad.addColorStop(1, bottomHex);
  g.fillStyle = grad;
  g.fillRect(x, y, w, h);
};

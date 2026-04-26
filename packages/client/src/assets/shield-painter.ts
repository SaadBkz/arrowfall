// Phase 10 — Shield overlay. Drawn under the archer body when
// `archer.hasShield === true`. 4 frames showing 4 sigils orbiting a
// central ring; the renderer cycles them at ~10 fps for the rotating
// look. Kept square 24×24 px so it covers the 8×11 archer hitbox with
// a generous halo.

import { newCanvas, px } from "./canvas.js";

export const SHIELD_SPRITE_SIZE = 24;
export const SHIELD_FRAME_COUNT = 4;

export type ShieldSpriteKey = `shield_${number}`;

export const buildShieldSprites = (): Map<
  ShieldSpriteKey,
  HTMLCanvasElement
> => {
  const out = new Map<ShieldSpriteKey, HTMLCanvasElement>();
  for (let f = 0; f < SHIELD_FRAME_COUNT; f++) {
    out.set(`shield_${f}`, paintShieldFrame(f));
  }
  return out;
};

const RING_INNER = 0xa; // radius 10 (24/2 = 12 outer)
const SIGIL_COLOR = "#56e1c8";
const SIGIL_BRIGHT = "#9af2da";
const RING_COLOR = "#cfdfee";

const paintShieldFrame = (frame: number): HTMLCanvasElement => {
  const cv = newCanvas(SHIELD_SPRITE_SIZE, SHIELD_SPRITE_SIZE);
  const g = cv.getContext("2d")!;
  const cx = SHIELD_SPRITE_SIZE / 2;
  const cy = SHIELD_SPRITE_SIZE / 2;

  // Outline ring — bresenham circle, 1px thick.
  drawCircle(g, cx - 0.5, cy - 0.5, RING_INNER, RING_COLOR);

  // 4 sigils placed at multiples of 90° plus a frame-driven angular
  // offset for the rotation feel. The orbit radius matches the ring.
  const angleOffset = (frame / SHIELD_FRAME_COUNT) * Math.PI * 2;
  for (let i = 0; i < 4; i++) {
    const angle = angleOffset + (i * Math.PI) / 2;
    const sx = Math.round(cx + Math.cos(angle) * RING_INNER) - 1;
    const sy = Math.round(cy + Math.sin(angle) * RING_INNER) - 1;
    // 2×2 sigil with bright center.
    px(g, sx, sy, SIGIL_COLOR);
    px(g, sx + 1, sy, SIGIL_BRIGHT);
    px(g, sx, sy + 1, SIGIL_BRIGHT);
    px(g, sx + 1, sy + 1, SIGIL_COLOR);
  }
  return cv;
};

// Midpoint circle algorithm. Fractional centre rounds to the nearest
// half-pixel which gives a more even ring on small sizes.
const drawCircle = (
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
): void => {
  let x = r;
  let y = 0;
  let err = 0;
  const set = (px_: number, py_: number) => {
    px(g, Math.round(cx + px_), Math.round(cy + py_), color);
  };
  while (x >= y) {
    set(x, y);
    set(y, x);
    set(-y, x);
    set(-x, y);
    set(-x, -y);
    set(-y, -x);
    set(y, -x);
    set(x, -y);
    if (err <= 0) {
      y += 1;
      err += 2 * y + 1;
    }
    if (err > 0) {
      x -= 1;
      err -= 2 * x + 1;
    }
  }
};

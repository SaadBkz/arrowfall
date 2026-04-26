// Phase 10 — Arrow sprites. Each arrow type has a flying sprite
// (oriented horizontal — the renderer rotates the texture to match
// velocity) and a grounded sprite. Bombs additionally have a small
// fuse animation (4 frames) which the renderer cycles cosmetically.
//
// Sprite dimensions: 12 px × 4 px. The collider remains 8×2 — the
// extra pixels are for fletching (back) and tip glow (front). The
// renderer offsets the sprite so the collider AABB top-left aligns
// with arrow.pos exactly.

import type { ArrowType } from "@arrowfall/engine";
import { newCanvas, px, rect } from "./canvas.js";

export const ARROW_SPRITE_W = 12;
export const ARROW_SPRITE_H = 4;

// Pixel offset between arrow.pos (top-left of 8×2 hitbox) and the
// sprite top-left after rendering. Used by ArrowsRenderer.
export const ARROW_SPRITE_OX = -2; // 2 px tail flares behind the AABB
export const ARROW_SPRITE_OY = -1; // 1 px above and below for fletch

export type ArrowSpriteKey =
  | `${ArrowType}_flying_${number}`
  | `${ArrowType}_grounded`;

export const buildArrowSprites = (): Map<ArrowSpriteKey, HTMLCanvasElement> => {
  const out = new Map<ArrowSpriteKey, HTMLCanvasElement>();

  // Normal — single static frame for both flying and grounded.
  out.set("normal_flying_0", paintNormalFlying());
  out.set("normal_grounded", paintNormalGrounded());

  // Bomb — fuse anim 4 frames flying. Single grounded.
  for (let f = 0; f < 4; f++) {
    out.set(`bomb_flying_${f}`, paintBombFlying(f));
  }
  out.set("bomb_grounded", paintBombGrounded());

  // Drill — rotating tip 4 frames flying. Single grounded.
  for (let f = 0; f < 4; f++) {
    out.set(`drill_flying_${f}`, paintDrillFlying(f));
  }
  out.set("drill_grounded", paintDrillGrounded());

  // Laser — pulse 2 frames flying (alternating high/low). Single grounded.
  for (let f = 0; f < 2; f++) {
    out.set(`laser_flying_${f}`, paintLaserFlying(f));
  }
  out.set("laser_grounded", paintLaserGrounded());

  return out;
};

const c = (): HTMLCanvasElement => newCanvas(ARROW_SPRITE_W, ARROW_SPRITE_H);

// ── Normal ────────────────────────────────────────────────────────
const paintNormalFlying = (): HTMLCanvasElement => {
  const cv = c();
  const g = cv.getContext("2d")!;
  // Layout (left = tail, right = tip):
  //   Tail fletch: 3px wide cross of accent
  //   Shaft: 6px brown line
  //   Tip: 2px metallic point
  // Y center = 1..2.
  // Fletching (red feather).
  px(g, 0, 1, "#c84030");
  px(g, 1, 0, "#c84030");
  px(g, 1, 1, "#ec6a5a");
  px(g, 1, 2, "#c84030");
  px(g, 2, 1, "#a02828");
  px(g, 2, 2, "#a02828");
  // Shaft brown.
  rect(g, 3, 1, 6, 1, "#8a5e34");
  rect(g, 3, 2, 6, 1, "#5a3e22");
  // Tip metal.
  px(g, 9, 1, "#dce6f4");
  px(g, 9, 2, "#5a82a5");
  px(g, 10, 1, "#a5bcd0");
  px(g, 10, 2, "#5a82a5");
  px(g, 11, 1, "#5a82a5");
  return cv;
};

const paintNormalGrounded = (): HTMLCanvasElement => paintNormalFlying();

// ── Bomb ──────────────────────────────────────────────────────────
const paintBombFlying = (frame: number): HTMLCanvasElement => {
  const cv = c();
  const g = cv.getContext("2d")!;
  // Tail (small fletch).
  px(g, 1, 1, "#5a3e22");
  px(g, 1, 2, "#5a3e22");
  // Black bomb body 4×3 dominant.
  rect(g, 3, 0, 5, 4, "#181024");
  px(g, 3, 0, "#0a0612");
  px(g, 7, 3, "#0a0612");
  // Highlight shine top-left.
  px(g, 4, 1, "#3a2840");
  // Fuse — 2px tube on top right; spark animates.
  px(g, 8, 0, "#a07a22"); // fuse base
  px(g, 9, 0, "#c89c3a");
  // Spark — orange flicker, position varies by frame.
  const sparks: ReadonlyArray<readonly [number, number, string]> = [
    [10, 0, "#ff7a2a"],
    [10, 1, "#ffaa48"],
    [11, 0, "#fcd757"],
    [10, 0, "#ff7a2a"],
  ];
  const s = sparks[frame % sparks.length]!;
  px(g, s[0], s[1], s[2]);
  return cv;
};

const paintBombGrounded = (): HTMLCanvasElement => {
  const cv = c();
  const g = cv.getContext("2d")!;
  rect(g, 4, 0, 5, 4, "#181024");
  px(g, 4, 0, "#0a0612");
  px(g, 8, 3, "#0a0612");
  px(g, 5, 1, "#3a2840");
  // Fuse stub no spark when grounded.
  px(g, 9, 0, "#5a3e22");
  return cv;
};

// ── Drill ─────────────────────────────────────────────────────────
const paintDrillFlying = (frame: number): HTMLCanvasElement => {
  const cv = c();
  const g = cv.getContext("2d")!;
  // Tail.
  px(g, 0, 1, "#7a4a2c");
  px(g, 1, 1, "#a87044");
  px(g, 1, 2, "#7a4a2c");
  // Orange shaft.
  rect(g, 2, 1, 5, 2, "#ff6a3a");
  rect(g, 2, 1, 5, 1, "#ff8c39");
  // Drill bit — 4×3 with rotating helix indicated by spec pixel.
  rect(g, 7, 0, 4, 4, "#c84030");
  px(g, 7, 0, "#7a2820");
  px(g, 10, 3, "#7a2820");
  // Helix highlight rotates.
  const helixY = [1, 2, 1, 2][frame % 4]!;
  const helixX = [8, 9, 9, 8][frame % 4]!;
  px(g, helixX, helixY, "#fcd757");
  px(g, 11, 1, "#dce6f4"); // tip spec
  return cv;
};

const paintDrillGrounded = (): HTMLCanvasElement => {
  const cv = c();
  const g = cv.getContext("2d")!;
  rect(g, 2, 1, 5, 2, "#a87044"); // shaft dim
  rect(g, 7, 0, 4, 4, "#7a2820"); // bit dim
  px(g, 11, 1, "#a87044");
  return cv;
};

// ── Laser ─────────────────────────────────────────────────────────
const paintLaserFlying = (frame: number): HTMLCanvasElement => {
  const cv = c();
  const g = cv.getContext("2d")!;
  // Solid energy bar end-to-end.
  const core = frame === 0 ? "#fafff5" : "#cfdfee";
  const halo = frame === 0 ? "#9af2da" : "#56e1c8";
  rect(g, 0, 1, ARROW_SPRITE_W, 2, core);
  // Halo top + bottom.
  rect(g, 0, 0, ARROW_SPRITE_W, 1, halo);
  rect(g, 0, 3, ARROW_SPRITE_W, 1, halo);
  // Bright tip.
  px(g, ARROW_SPRITE_W - 1, 1, "#ffffff");
  px(g, ARROW_SPRITE_W - 1, 2, "#ffffff");
  return cv;
};

const paintLaserGrounded = (): HTMLCanvasElement => {
  // Lasers despawn before grounding — defensive sprite (dim grey).
  const cv = c();
  const g = cv.getContext("2d")!;
  rect(g, 0, 1, ARROW_SPRITE_W, 2, "#5a82a5");
  return cv;
};

// Convenience: pick a flying frame given current age (frames lived).
export const flyingFrameFor = (
  type: ArrowType,
  age: number,
): ArrowSpriteKey => {
  switch (type) {
    case "normal":
      return "normal_flying_0";
    case "bomb":
      return `bomb_flying_${Math.floor(age / 4) % 4}`;
    case "drill":
      return `drill_flying_${Math.floor(age / 3) % 4}`;
    case "laser":
      return `laser_flying_${Math.floor(age / 2) % 2}`;
  }
};

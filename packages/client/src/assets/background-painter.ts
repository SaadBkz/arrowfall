// Phase 10 — Background painter. 480×270 px full-screen images, one
// per parallax layer per theme:
//
//   back layer  (parallax 0.4) — sky / void / nightSky gradient + soft cosmic detail
//   mid  layer  (parallax 0.7) — silhouette horizon (trees / mountains / colonnes)
//
// The Game's background renderer scrolls these slightly with `tick`
// to give a gentle drift. Layers are pre-baked once at boot — no
// per-frame canvas work after build.

import type { ThemeId } from "@arrowfall/shared";
import { mulberry32, newCanvas, px, rect, vGradient } from "./canvas.js";
import { PALETTES, type ThemePalette } from "./palettes.js";

export const BG_W = 480;
export const BG_H = 270;

export type BackgroundLayer = "back" | "mid";

export type BackgroundSpriteKey = `bg_${ThemeId}_${BackgroundLayer}`;

export const buildBackgroundSprites = (
  theme: ThemeId,
): Map<BackgroundSpriteKey, HTMLCanvasElement> => {
  const out = new Map<BackgroundSpriteKey, HTMLCanvasElement>();
  out.set(`bg_${theme}_back`, paintBackLayer(theme));
  out.set(`bg_${theme}_mid`, paintMidLayer(theme));
  return out;
};

const paintBackLayer = (theme: ThemeId): HTMLCanvasElement => {
  const cv = newCanvas(BG_W, BG_H);
  const g = cv.getContext("2d")!;
  const p = PALETTES[theme];

  switch (theme) {
    case "sacred-grove":
      // Daytime sky: light blue → pale top.
      vGradient(g, 0, 0, BG_W, BG_H, p.sky[3], p.sky[1]);
      // Distant cumulus clouds.
      paintClouds(g, p);
      // Sun glow upper-right.
      paintSunGlow(g, p);
      break;
    case "twin-spires":
      // Night sky: deep purple → dark blue.
      vGradient(g, 0, 0, BG_W, BG_H, p.sky[1], p.sky[3]);
      // Stars.
      paintStars(g, p);
      // Moon upper-left.
      paintMoon(g, p);
      // Drifting snow particles.
      paintSnow(g, p);
      break;
    case "old-temple":
      // Void: deep black bottom → faint purple top (cosmic dust).
      vGradient(g, 0, 0, BG_W, BG_H, p.sky[3], p.sky[0]);
      // Floating sigils.
      paintSigils(g, p);
      break;
  }

  return cv;
};

const paintMidLayer = (theme: ThemeId): HTMLCanvasElement => {
  const cv = newCanvas(BG_W, BG_H);
  const g = cv.getContext("2d")!;
  const p = PALETTES[theme];

  switch (theme) {
    case "sacred-grove":
      paintTreeSilhouettes(g, p);
      break;
    case "twin-spires":
      paintMountains(g, p);
      break;
    case "old-temple":
      paintColumns(g, p);
      break;
  }
  return cv;
};

// ── Sacred Grove ──────────────────────────────────────────────────
const paintClouds = (g: CanvasRenderingContext2D, p: ThemePalette): void => {
  // 6 cloud blobs, deterministic positions.
  const positions: ReadonlyArray<readonly [number, number, number]> = [
    [40, 30, 18],
    [120, 50, 14],
    [220, 25, 22],
    [320, 60, 16],
    [400, 35, 20],
    [70, 80, 12],
  ];
  for (const [cx, cy, w] of positions) {
    g.globalAlpha = 0.85;
    rect(g, cx, cy, w, 4, p.sky[3]);
    rect(g, cx + 2, cy - 2, w - 4, 2, p.sky[3]);
    rect(g, cx + 4, cy + 4, w - 6, 2, p.text[3]);
    g.globalAlpha = 1;
  }
};

const paintSunGlow = (g: CanvasRenderingContext2D, p: ThemePalette): void => {
  g.globalAlpha = 0.25;
  for (let r = 50; r > 10; r -= 5) {
    g.fillStyle = p.metal[2];
    g.beginPath();
    g.arc(420, 50, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
};

const paintTreeSilhouettes = (g: CanvasRenderingContext2D, p: ThemePalette): void => {
  // Distant rolling trees along a horizon at y=200.
  const horizonY = 200;
  // Background hill.
  rect(g, 0, horizonY, BG_W, BG_H - horizonY, p.accent[0]);
  rect(g, 0, horizonY, BG_W, 1, p.accent[1]);
  // Tree clusters.
  const trees = [30, 80, 150, 210, 280, 350, 420, 460];
  for (const tx of trees) {
    paintTree(g, tx, horizonY, p);
  }
};

const paintTree = (
  g: CanvasRenderingContext2D,
  tx: number,
  baseY: number,
  p: ThemePalette,
): void => {
  // Trunk.
  rect(g, tx, baseY - 12, 3, 12, p.wood[0]);
  // Foliage triangle.
  rect(g, tx - 6, baseY - 16, 15, 4, p.accent[0]);
  rect(g, tx - 4, baseY - 20, 11, 4, p.accent[0]);
  rect(g, tx - 2, baseY - 24, 7, 4, p.accent[1]);
};

// ── Twin Spires ───────────────────────────────────────────────────
const paintStars = (g: CanvasRenderingContext2D, p: ThemePalette): void => {
  const rng = mulberry32(0xc0_ffee);
  for (let i = 0; i < 80; i++) {
    const sx = Math.floor(rng() * BG_W);
    const sy = Math.floor(rng() * (BG_H * 0.6));
    px(g, sx, sy, rng() > 0.7 ? p.text[3] : p.accent[2]);
  }
};

const paintMoon = (g: CanvasRenderingContext2D, p: ThemePalette): void => {
  // Full moon.
  g.fillStyle = p.accent[3];
  g.beginPath();
  g.arc(70, 50, 18, 0, Math.PI * 2);
  g.fill();
  // Bite shadow on the right.
  g.fillStyle = p.sky[1];
  g.beginPath();
  g.arc(78, 46, 16, 0, Math.PI * 2);
  g.fill();
};

const paintSnow = (g: CanvasRenderingContext2D, p: ThemePalette): void => {
  const rng = mulberry32(0xfa11_ce);
  g.globalAlpha = 0.7;
  for (let i = 0; i < 60; i++) {
    const sx = Math.floor(rng() * BG_W);
    const sy = Math.floor(rng() * BG_H);
    px(g, sx, sy, p.accent[3]);
  }
  g.globalAlpha = 1;
};

const paintMountains = (g: CanvasRenderingContext2D, p: ThemePalette): void => {
  // Two big triangular peaks.
  const horizonY = 210;
  rect(g, 0, horizonY, BG_W, BG_H - horizonY, p.stone[0]);
  // Peak 1.
  paintTriangle(g, 100, horizonY, 80, 70, p.stone[1]);
  paintTriangle(g, 110, horizonY, 80, 50, p.accent[2]); // snow cap area
  // Peak 2.
  paintTriangle(g, 320, horizonY, 100, 90, p.stone[1]);
  paintTriangle(g, 332, horizonY, 100, 60, p.accent[2]);
  // Smaller foothills.
  paintTriangle(g, 220, horizonY, 60, 35, p.stone[2]);
  paintTriangle(g, 410, horizonY, 50, 30, p.stone[2]);
};

const paintTriangle = (
  g: CanvasRenderingContext2D,
  baseX: number,
  baseY: number,
  baseW: number,
  height: number,
  color: string,
): void => {
  // Approximate triangle with horizontal strips, peaked at baseX + baseW/2.
  for (let row = 0; row < height; row++) {
    const w = Math.max(1, Math.floor(baseW * (1 - row / height)));
    const x = baseX + (baseW - w) / 2;
    rect(g, Math.floor(x), baseY - row, w, 1, color);
  }
};

// ── Old Temple ────────────────────────────────────────────────────
const paintSigils = (g: CanvasRenderingContext2D, p: ThemePalette): void => {
  const rng = mulberry32(0xab_cd_ef);
  g.globalAlpha = 0.5;
  for (let i = 0; i < 8; i++) {
    const sx = Math.floor(rng() * BG_W);
    const sy = Math.floor(rng() * BG_H);
    const r = 3 + Math.floor(rng() * 4);
    g.strokeStyle = p.metal[1];
    g.beginPath();
    g.arc(sx, sy, r, 0, Math.PI * 2);
    g.stroke();
    px(g, sx, sy, p.accent[2]);
  }
  g.globalAlpha = 1;
};

const paintColumns = (g: CanvasRenderingContext2D, p: ThemePalette): void => {
  // 4 stone columns spaced across the bottom + giant idol silhouette
  // in the centre back.
  const horizonY = 220;
  rect(g, 0, horizonY, BG_W, BG_H - horizonY, p.stone[0]);

  // Idol — wide stone silhouette behind, centred horizontally.
  rect(g, 200, 100, 80, 130, p.stone[0]);
  rect(g, 220, 80, 40, 30, p.stone[0]);
  // Glowing eyes.
  px(g, 230, 100, p.fire[2]);
  px(g, 250, 100, p.fire[2]);

  // Columns.
  const cols = [40, 130, 350, 440];
  for (const cx of cols) {
    rect(g, cx, 130, 12, 100, p.stone[1]);
    rect(g, cx, 130, 12, 4, p.metal[1]); // capital
    rect(g, cx, 226, 12, 4, p.metal[1]); // base
    rect(g, cx + 4, 134, 4, 92, p.stone[2]); // shaft highlight
  }
};

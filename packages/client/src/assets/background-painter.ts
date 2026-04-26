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
  // Three rolling layers of forest, each darker as we go back. Adds
  // real depth instead of one flat row of trees.
  const horizonY = 200;

  // Layer A — far-back hill (darkest).
  rect(g, 0, horizonY - 30, BG_W, BG_H - (horizonY - 30), p.accent[0]);
  // Painted bumpy ridge.
  for (let x = 0; x < BG_W; x += 8) {
    const h = 4 + Math.round(Math.sin(x * 0.05) * 3 + Math.cos(x * 0.02) * 2);
    rect(g, x, horizonY - 30 - h, 8, h, p.accent[0]);
  }
  // Far-back tiny tree silhouettes.
  for (let i = 0; i < 14; i++) {
    const tx = 20 + i * 34 + (i % 2) * 10;
    paintTreeSmall(g, tx, horizonY - 30, p, 0);
  }

  // Layer B — mid hill.
  rect(g, 0, horizonY - 8, BG_W, BG_H - (horizonY - 8), p.accent[0]);
  rect(g, 0, horizonY - 8, BG_W, 1, p.accent[1]);
  for (let x = 0; x < BG_W; x += 4) {
    const h = 2 + Math.round(Math.sin(x * 0.08) * 2);
    if (h > 0) rect(g, x, horizonY - 8 - h, 4, h, p.accent[0]);
  }

  // Layer C — front trees (biggest, brightest).
  const trees = [30, 80, 150, 210, 280, 350, 420, 460];
  for (const tx of trees) {
    paintTree(g, tx, horizonY, p);
  }
  // Sparse fireflies.
  const rng = mulberry32(0xa11_f15);
  for (let i = 0; i < 12; i++) {
    const fx = Math.floor(rng() * BG_W);
    const fy = horizonY - 20 - Math.floor(rng() * 60);
    px(g, fx, fy, p.metal[3]);
    px(g, fx + 1, fy, p.metal[2]);
  }
};

const paintTree = (
  g: CanvasRenderingContext2D,
  tx: number,
  baseY: number,
  p: ThemePalette,
): void => {
  // Trunk.
  rect(g, tx, baseY - 14, 3, 14, p.wood[0]);
  rect(g, tx + 2, baseY - 14, 1, 14, p.wood[1]);
  // Foliage triangle stack.
  rect(g, tx - 6, baseY - 18, 15, 4, p.accent[0]);
  rect(g, tx - 4, baseY - 22, 11, 4, p.accent[0]);
  rect(g, tx - 2, baseY - 26, 7, 4, p.accent[1]);
  // Highlights.
  px(g, tx - 5, baseY - 18, p.accent[1]);
  px(g, tx - 3, baseY - 22, p.accent[1]);
  px(g, tx - 1, baseY - 25, p.accent[2]);
  px(g, tx + 1, baseY - 23, p.accent[2]);
};

const paintTreeSmall = (
  g: CanvasRenderingContext2D,
  tx: number,
  baseY: number,
  p: ThemePalette,
  _layer: number,
): void => {
  rect(g, tx, baseY - 7, 1, 7, p.wood[0]);
  rect(g, tx - 2, baseY - 9, 5, 3, p.accent[0]);
  rect(g, tx - 1, baseY - 12, 3, 3, p.accent[0]);
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
  const horizonY = 210;
  // Far layer — pale silhouette.
  rect(g, 0, horizonY - 35, BG_W, 35, p.sky[3]);
  paintTriangle(g, 50, horizonY - 35, 100, 50, p.sky[2]);
  paintTriangle(g, 200, horizonY - 35, 130, 65, p.sky[2]);
  paintTriangle(g, 360, horizonY - 35, 110, 55, p.sky[2]);
  // Mid layer — main peaks.
  rect(g, 0, horizonY, BG_W, BG_H - horizonY, p.stone[0]);
  paintTriangle(g, 100, horizonY, 80, 70, p.stone[1]);
  paintTriangle(g, 110, horizonY, 80, 50, p.accent[2]); // snow cap
  paintTriangle(g, 320, horizonY, 100, 90, p.stone[1]);
  paintTriangle(g, 332, horizonY, 100, 60, p.accent[2]);
  // Foothills.
  paintTriangle(g, 220, horizonY, 60, 35, p.stone[2]);
  paintTriangle(g, 410, horizonY, 50, 30, p.stone[2]);
  // Northern lights — three faint vertical streaks.
  g.globalAlpha = 0.18;
  for (const [x, color] of [
    [120, p.accent[2]],
    [240, p.metal[2]],
    [380, p.accent[3]],
  ] as ReadonlyArray<readonly [number, string]>) {
    g.fillStyle = color;
    g.fillRect(x, 30, 2, 80);
    g.fillRect(x + 2, 50, 1, 60);
    g.fillRect(x - 2, 60, 1, 50);
  }
  g.globalAlpha = 1;
  // Pine trees in front of the mid mountains, dark.
  const pines = [25, 60, 95, 165, 195, 250, 285, 380, 420, 455];
  for (const px_ of pines) {
    paintPine(g, px_, horizonY, p);
  }
};

const paintPine = (
  g: CanvasRenderingContext2D,
  tx: number,
  baseY: number,
  p: ThemePalette,
): void => {
  rect(g, tx + 1, baseY - 4, 1, 4, p.stone[0]);
  // Pine layered triangle.
  rect(g, tx - 3, baseY - 6, 7, 2, p.stone[0]);
  rect(g, tx - 2, baseY - 9, 5, 3, p.stone[0]);
  rect(g, tx - 1, baseY - 12, 3, 3, p.stone[0]);
  // Snow tip.
  px(g, tx + 1, baseY - 12, p.accent[3]);
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
  // Multi-layer Mayan temple interior:
  //   far back — pyramid silhouette
  //   mid     — giant carved idol head
  //   front   — column array with gold trim
  //   floating — torch braziers + glyphs
  const horizonY = 220;
  rect(g, 0, horizonY, BG_W, BG_H - horizonY, p.stone[0]);

  // Far pyramid silhouette.
  paintTriangle(g, 80, horizonY, 320, 180, p.sky[3]);
  // Torch step lines on the pyramid.
  rect(g, 100, 110, 280, 1, p.fire[0]);
  rect(g, 130, 70, 220, 1, p.fire[0]);
  rect(g, 160, 30, 160, 1, p.fire[0]);

  // Idol head — bigger, more detailed.
  rect(g, 180, 80, 120, 150, p.stone[0]);
  rect(g, 200, 50, 80, 35, p.stone[0]);
  // Headdress feathers.
  rect(g, 170, 60, 8, 30, p.metal[0]);
  rect(g, 302, 60, 8, 30, p.metal[0]);
  rect(g, 172, 70, 4, 20, p.fire[1]);
  rect(g, 304, 70, 4, 20, p.fire[1]);
  // Glowing eyes.
  rect(g, 215, 110, 18, 8, p.fire[2]);
  rect(g, 247, 110, 18, 8, p.fire[2]);
  rect(g, 219, 113, 10, 4, p.fire[3]);
  rect(g, 251, 113, 10, 4, p.fire[3]);
  // Nose / mouth.
  rect(g, 235, 130, 10, 18, p.metal[1]);
  rect(g, 215, 155, 50, 8, p.stone[0]);
  // Fangs.
  rect(g, 220, 163, 4, 6, p.text[3]);
  rect(g, 240, 163, 4, 6, p.text[3]);
  rect(g, 256, 163, 4, 6, p.text[3]);

  // Columns — front layer, beefier with cap detail.
  const cols = [20, 110, 360, 450];
  for (const cx of cols) {
    rect(g, cx, 110, 16, 130, p.stone[1]);
    rect(g, cx + 1, 110, 14, 6, p.metal[1]); // capital
    rect(g, cx, 116, 16, 2, p.metal[0]);
    rect(g, cx, 232, 16, 8, p.metal[1]); // base
    rect(g, cx + 5, 120, 6, 110, p.stone[2]); // shaft highlight
    // Glyph rows on shaft.
    for (let y = 130; y < 220; y += 18) {
      rect(g, cx + 4, y, 8, 1, p.metal[2]);
      px(g, cx + 7, y - 1, p.accent[2]);
    }
  }

  // Floating glyphs/runes scattered.
  const rng = mulberry32(0xdeadc0de);
  g.globalAlpha = 0.55;
  for (let i = 0; i < 14; i++) {
    const sx = Math.floor(rng() * BG_W);
    const sy = 30 + Math.floor(rng() * 150);
    px(g, sx, sy, p.accent[2]);
    px(g, sx + 1, sy, p.accent[3]);
    px(g, sx, sy + 1, p.accent[3]);
  }
  g.globalAlpha = 1;
};

// Phase 10.5.a — Decorative side-panel frames. Two 32×270 textures per
// theme (left + right), rendered OUTSIDE the 480×270 gameplay arena via
// a viewport bumped to 544×270 (see Game / main.ts). The frame gives
// each map the "tableau encadré" feel of TowerFall's Cataclysm /
// Twilight Spire screenshots — engraved stone with theme-specific
// runes, mascarons, totems and trim.
//
// All output is deterministic (every detail position derives from a
// per-(theme, side, y) seed) so two builds produce identical pixels.
//
// Anchor: top-left. Width/height are documented in the constants below
// so the renderer can position without a heuristic.

import type { ThemeId } from "@arrowfall/shared";
import { mulberry32, newCanvas, px, rect, vGradient } from "./canvas.js";
import { PALETTES, type ThemePalette } from "./palettes.js";

export const FRAME_PANEL_W = 32;
export const FRAME_PANEL_H = 270;

export type FrameSide = "left" | "right";
export type FrameSpriteKey = `frame_${ThemeId}_${FrameSide}`;

export const buildFrameSprites = (
  theme: ThemeId,
): Map<FrameSpriteKey, HTMLCanvasElement> => {
  const out = new Map<FrameSpriteKey, HTMLCanvasElement>();
  out.set(`frame_${theme}_left`, paintFramePanel(theme, "left"));
  out.set(`frame_${theme}_right`, paintFramePanel(theme, "right"));
  return out;
};

const paintFramePanel = (theme: ThemeId, side: FrameSide): HTMLCanvasElement => {
  const cv = newCanvas(FRAME_PANEL_W, FRAME_PANEL_H);
  const g = cv.getContext("2d")!;
  const p = PALETTES[theme];

  // Common base: vertical gradient stone fill. Slightly darker at the
  // bottom — gravity for the eye, so the frame "sits" rather than
  // floats.
  vGradient(g, 0, 0, FRAME_PANEL_W, FRAME_PANEL_H, p.stone[1], p.stone[0]);

  switch (theme) {
    case "sacred-grove":
      paintSacredFrame(g, p, side);
      break;
    case "twin-spires":
      paintSpiresFrame(g, p, side);
      break;
    case "old-temple":
      paintTempleFrame(g, p, side);
      break;
  }

  // Common: hard inner-edge shadow on the side facing the playfield.
  // This separates the frame from the gameplay area so the eye reads
  // them as different planes.
  paintInnerEdgeShadow(g, side, p);

  return cv;
};

// Inner edge = the side that touches the play arena. For a left panel
// that's the right column (x = W-1); for a right panel that's the left
// column (x = 0). We darken 3 px so the play area appears recessed.
const paintInnerEdgeShadow = (
  g: CanvasRenderingContext2D,
  side: FrameSide,
  p: ThemePalette,
): void => {
  const inner = side === "left" ? FRAME_PANEL_W - 1 : 0;
  // 3-step gradient — hardest closest to the play area.
  for (let i = 0; i < 3; i++) {
    const x = side === "left" ? inner - i : inner + i;
    const color = i === 0 ? "#000000" : i === 1 ? p.sky[0] : p.stone[0];
    rect(g, x, 0, 1, FRAME_PANEL_H, color);
  }
  // Outer edge: thin highlight so the frame "catches the light".
  const outer = side === "left" ? 0 : FRAME_PANEL_W - 1;
  rect(g, outer, 0, 1, FRAME_PANEL_H, p.stone[2]);
};

// ── Sacred Grove ──────────────────────────────────────────────────
//
// Stone column with crawling moss + small wood totems at top + bottom +
// midway mascarons. Warm green/wood palette.
const paintSacredFrame = (
  g: CanvasRenderingContext2D,
  p: ThemePalette,
  side: FrameSide,
): void => {
  const rng = mulberry32(seedOf("sacred-grove", side));

  // Brick-like horizontal courses every 18 px — break the column up
  // visually so it doesn't read as one tall bar.
  for (let y = 8; y < FRAME_PANEL_H; y += 18) {
    rect(g, 2, y, FRAME_PANEL_W - 4, 1, p.stone[0]);
    rect(g, 2, y - 1, FRAME_PANEL_W - 4, 1, p.stone[2]);
  }

  // Wood totem cap at top (16 px tall).
  rect(g, 4, 0, FRAME_PANEL_W - 8, 16, p.wood[1]);
  rect(g, 4, 0, FRAME_PANEL_W - 8, 1, p.wood[2]);
  rect(g, 4, 14, FRAME_PANEL_W - 8, 2, p.wood[0]);
  rect(g, 5, 4, FRAME_PANEL_W - 10, 1, p.metal[1]); // gold band
  rect(g, 5, 10, FRAME_PANEL_W - 10, 1, p.metal[1]);
  // Carved leaf glyph centred.
  rect(g, 12, 6, 8, 3, p.accent[0]);
  px(g, 13, 5, p.accent[1]);
  px(g, 18, 5, p.accent[1]);
  px(g, 15, 9, p.accent[2]);
  px(g, 16, 9, p.accent[2]);

  // Wood totem foot at bottom (mirrors top).
  const footY = FRAME_PANEL_H - 16;
  rect(g, 4, footY, FRAME_PANEL_W - 8, 16, p.wood[1]);
  rect(g, 4, footY, FRAME_PANEL_W - 8, 1, p.wood[2]);
  rect(g, 4, FRAME_PANEL_H - 1, FRAME_PANEL_W - 8, 1, p.wood[0]);
  rect(g, 5, footY + 4, FRAME_PANEL_W - 10, 1, p.metal[1]);
  rect(g, 5, footY + 11, FRAME_PANEL_W - 10, 1, p.metal[1]);

  // Two carved mascaron faces — small leaf-crowned heads, deterministic
  // y positions in the middle band.
  const faceYs = [70, 180];
  for (const fy of faceYs) {
    paintLeafMascaron(g, 8, fy, p);
  }

  // Crawling moss patches — alpha 0.6 patches scattered. Roughly 20
  // patches per panel, varied size.
  g.globalAlpha = 0.55;
  for (let i = 0; i < 22; i++) {
    const mx = Math.floor(rng() * (FRAME_PANEL_W - 6)) + 2;
    const my = Math.floor(rng() * (FRAME_PANEL_H - 8)) + 4;
    const w = 2 + Math.floor(rng() * 3);
    const h = 1 + Math.floor(rng() * 2);
    rect(g, mx, my, w, h, p.accent[0]);
    if (rng() > 0.5) px(g, mx, my, p.accent[1]);
  }
  g.globalAlpha = 1;

  // Hanging vine on the inner column edge.
  const vineX = side === "left" ? FRAME_PANEL_W - 6 : 4;
  for (let y = 18; y < FRAME_PANEL_H - 18; y++) {
    if (y % 3 === 0) px(g, vineX + (y % 6 < 3 ? 0 : 1), y, p.accent[1]);
    if (y % 11 === 5) {
      px(g, vineX - 1, y, p.accent[2]);
      px(g, vineX + 1, y, p.accent[2]);
    }
  }
};

const paintLeafMascaron = (
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  p: ThemePalette,
): void => {
  // 16×20 leaf-crowned face on stone.
  rect(g, x, y, 16, 20, p.stone[2]);
  rect(g, x, y, 16, 1, p.stone[3]);
  rect(g, x, y + 19, 16, 1, p.stone[0]);
  // Leaf crown.
  rect(g, x + 1, y + 1, 14, 2, p.accent[0]);
  rect(g, x + 5, y - 1, 6, 2, p.accent[1]);
  px(g, x + 7, y - 2, p.accent[2]);
  px(g, x + 8, y - 2, p.accent[2]);
  // Face plate.
  rect(g, x + 3, y + 4, 10, 12, p.stone[1]);
  // Eyes (gold slits).
  rect(g, x + 5, y + 8, 2, 1, p.metal[2]);
  rect(g, x + 9, y + 8, 2, 1, p.metal[2]);
  // Mouth.
  rect(g, x + 6, y + 12, 4, 1, p.stone[0]);
  // Side moss on the mascaron itself.
  px(g, x + 1, y + 6, p.accent[1]);
  px(g, x + 14, y + 14, p.accent[1]);
};

// ── Twin Spires ───────────────────────────────────────────────────
//
// Cold blue marble pillar, hanging banner (red), small icicles top,
// snow caps. Theme of stone-cold grandeur.
const paintSpiresFrame = (
  g: CanvasRenderingContext2D,
  p: ThemePalette,
  side: FrameSide,
): void => {
  const rng = mulberry32(seedOf("twin-spires", side));

  // Vertical "marble vein" lines — 3 of them, staggered.
  for (const [vx, alpha] of [
    [6, 0.35],
    [16, 0.5],
    [24, 0.3],
  ] as ReadonlyArray<readonly [number, number]>) {
    g.globalAlpha = alpha;
    for (let y = 0; y < FRAME_PANEL_H; y++) {
      const off = Math.round(Math.sin(y * 0.06 + vx) * 1.2);
      px(g, vx + off, y, p.accent[2]);
    }
    g.globalAlpha = 1;
  }

  // Stone block courses every 24 px (taller than sacred — feels more
  // monumental).
  for (let y = 12; y < FRAME_PANEL_H; y += 24) {
    rect(g, 1, y, FRAME_PANEL_W - 2, 1, p.stone[0]);
    rect(g, 1, y - 1, FRAME_PANEL_W - 2, 1, p.stone[3]);
  }

  // Top: stone cap with snow piled on.
  rect(g, 0, 0, FRAME_PANEL_W, 12, p.stone[2]);
  rect(g, 0, 0, FRAME_PANEL_W, 4, p.accent[3]); // snow
  rect(g, 0, 4, FRAME_PANEL_W, 1, p.accent[2]);
  // Snow drips down the sides.
  for (let i = 0; i < 6; i++) {
    const sx = Math.floor(rng() * FRAME_PANEL_W);
    const sh = 3 + Math.floor(rng() * 6);
    rect(g, sx, 4, 1, sh, p.accent[3]);
  }

  // Top icicles hanging from the cap.
  for (const ix of [4, 12, 22, 28]) {
    paintIcicle(g, ix, 12, 6 + Math.floor(rng() * 4), p);
  }

  // Bottom: stone base with pile of snow.
  const baseY = FRAME_PANEL_H - 14;
  rect(g, 0, baseY, FRAME_PANEL_W, 14, p.stone[2]);
  rect(g, 0, baseY, FRAME_PANEL_W, 1, p.stone[3]);
  rect(g, 0, FRAME_PANEL_H - 4, FRAME_PANEL_W, 4, p.accent[2]);
  rect(g, 0, FRAME_PANEL_H - 4, FRAME_PANEL_W, 1, p.accent[3]);

  // Hanging banner — drapes from a rod near the top, mid-height. Red.
  paintHangingBanner(g, side, p);

  // Sparse snow crystals on the column.
  g.globalAlpha = 0.7;
  for (let i = 0; i < 18; i++) {
    const sx = Math.floor(rng() * FRAME_PANEL_W);
    const sy = 14 + Math.floor(rng() * (FRAME_PANEL_H - 30));
    px(g, sx, sy, p.accent[3]);
  }
  g.globalAlpha = 1;
};

const paintIcicle = (
  g: CanvasRenderingContext2D,
  x: number,
  topY: number,
  h: number,
  p: ThemePalette,
): void => {
  for (let i = 0; i < h; i++) {
    const w = Math.max(1, 3 - Math.floor((i / h) * 3));
    const ox = Math.floor((3 - w) / 2);
    rect(g, x + ox, topY + i, w, 1, p.accent[2]);
    if (w >= 2) px(g, x + ox, topY + i, p.accent[3]);
  }
};

const paintHangingBanner = (
  g: CanvasRenderingContext2D,
  side: FrameSide,
  p: ThemePalette,
): void => {
  // 12×54, draped from y=80 to y=134. Centred on the panel.
  const bx = Math.floor((FRAME_PANEL_W - 12) / 2);
  const by = 80;
  // Top rod.
  rect(g, bx - 1, by, 14, 2, p.metal[1]); // gold rod
  rect(g, bx - 1, by, 14, 1, p.metal[2]);
  // Banner body — banner red is the metal ramp for spires.
  rect(g, bx, by + 2, 12, 44, p.metal[2]);
  rect(g, bx, by + 2, 12, 1, p.metal[3]); // top highlight
  rect(g, bx, by + 45, 12, 1, p.metal[1]);
  rect(g, bx, by + 2, 1, 44, p.metal[1]); // left edge
  rect(g, bx + 11, by + 2, 1, 44, p.metal[1]); // right edge
  // Crest sigil — gold sun.
  rect(g, bx + 4, by + 18, 4, 4, p.fire[2]);
  px(g, bx + 4, by + 18, p.fire[3]);
  px(g, bx + 7, by + 18, p.fire[3]);
  px(g, bx + 4, by + 21, p.fire[3]);
  px(g, bx + 7, by + 21, p.fire[3]);
  px(g, bx + 5, by + 19, p.metal[3]);
  // V-cut bottom.
  rect(g, bx, by + 46, 12, 1, p.metal[2]);
  rect(g, bx + 1, by + 47, 10, 1, p.metal[2]);
  rect(g, bx + 2, by + 48, 8, 1, p.metal[2]);
  rect(g, bx + 4, by + 49, 4, 1, p.metal[1]);
  px(g, bx + 5, by + 50, p.metal[1]);
  px(g, bx + 6, by + 50, p.metal[1]);
  // A breath of breeze — banner shifts slightly toward the play area.
  void side;
};

// ── Old Temple ────────────────────────────────────────────────────
//
// Deep purple stone with engraved runes (gold/orange), 2 mascaron
// faces, scrollwork. The most ornate of the three.
const paintTempleFrame = (
  g: CanvasRenderingContext2D,
  p: ThemePalette,
  side: FrameSide,
): void => {
  const rng = mulberry32(seedOf("old-temple", side));

  // Brick course every 14 px — denser, gives the "small block" feel of
  // the temple inspirations.
  for (let y = 6; y < FRAME_PANEL_H; y += 14) {
    rect(g, 1, y, FRAME_PANEL_W - 2, 1, p.stone[0]);
    rect(g, 1, y - 1, FRAME_PANEL_W - 2, 1, p.metal[0]);
  }
  // Vertical mortar line straight down the middle.
  rect(g, Math.floor(FRAME_PANEL_W / 2), 0, 1, FRAME_PANEL_H, p.stone[0]);

  // Gold trim border on the outer edge — frame within frame.
  const outer = side === "left" ? 1 : FRAME_PANEL_W - 2;
  rect(g, outer, 4, 1, FRAME_PANEL_H - 8, p.metal[1]);
  // Trim top / bottom caps.
  rect(g, outer - (side === "left" ? 0 : 2), 3, 3, 1, p.metal[2]);
  rect(g, outer - (side === "left" ? 0 : 2), FRAME_PANEL_H - 4, 3, 1, p.metal[2]);

  // Top ornamental cap — gold scrollwork.
  rect(g, 0, 0, FRAME_PANEL_W, 14, p.stone[0]);
  rect(g, 2, 2, FRAME_PANEL_W - 4, 10, p.metal[0]);
  rect(g, 4, 4, FRAME_PANEL_W - 8, 6, p.metal[1]);
  rect(g, 4, 4, FRAME_PANEL_W - 8, 1, p.metal[2]);
  // Cyan magic gem in the cap centre.
  rect(g, 14, 5, 4, 4, p.accent[2]);
  px(g, 15, 5, p.accent[3]);
  px(g, 16, 8, p.accent[3]);

  // Bottom ornamental cap — mirror of top.
  const cy = FRAME_PANEL_H - 14;
  rect(g, 0, cy, FRAME_PANEL_W, 14, p.stone[0]);
  rect(g, 2, cy + 2, FRAME_PANEL_W - 4, 10, p.metal[0]);
  rect(g, 4, cy + 4, FRAME_PANEL_W - 8, 6, p.metal[1]);
  rect(g, 4, cy + 4, FRAME_PANEL_W - 8, 1, p.metal[2]);
  rect(g, 14, cy + 5, 4, 4, p.accent[2]);
  px(g, 15, cy + 5, p.accent[3]);
  px(g, 16, cy + 8, p.accent[3]);

  // Two big mayan-style mascaron faces, deterministic placements.
  paintTempleMascaron(g, 4, 60, p);
  paintTempleMascaron(g, 4, 174, p);

  // Engraved runes scattered between the mascarons — deterministic
  // glyphs at fixed grid positions.
  const runeRows = [40, 52, 100, 112, 138, 150, 220, 232];
  for (const ry of runeRows) {
    paintTempleRune(g, 9, ry, rng() > 0.5 ? "circle" : "spiral", p);
  }

  // Faint floating orange torch glow embers.
  g.globalAlpha = 0.4;
  for (let i = 0; i < 14; i++) {
    const sx = 4 + Math.floor(rng() * (FRAME_PANEL_W - 8));
    const sy = 14 + Math.floor(rng() * (FRAME_PANEL_H - 28));
    px(g, sx, sy, p.fire[2]);
    if (rng() > 0.5) px(g, sx, sy - 1, p.fire[3]);
  }
  g.globalAlpha = 1;
};

const paintTempleMascaron = (
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  p: ThemePalette,
): void => {
  // 24×30 ornate face: stone plate, gold trim, fanged mouth, glowing
  // orange eyes. The temple's signature wall sculpture.
  rect(g, x, y, 24, 30, p.stone[2]);
  rect(g, x, y, 24, 1, p.stone[3]);
  rect(g, x, y + 29, 24, 1, p.stone[0]);
  // Gold border.
  rect(g, x + 1, y + 1, 22, 1, p.metal[1]);
  rect(g, x + 1, y + 28, 22, 1, p.metal[1]);
  rect(g, x + 1, y + 1, 1, 28, p.metal[1]);
  rect(g, x + 22, y + 1, 1, 28, p.metal[1]);
  // Inner face plate.
  rect(g, x + 3, y + 3, 18, 24, p.stone[1]);
  // Headdress slab.
  rect(g, x + 4, y + 4, 16, 4, p.metal[1]);
  rect(g, x + 4, y + 4, 16, 1, p.metal[2]);
  rect(g, x + 8, y + 2, 8, 2, p.metal[1]);
  // Side feathers.
  rect(g, x + 2, y + 6, 2, 6, p.metal[1]);
  rect(g, x + 20, y + 6, 2, 6, p.metal[1]);
  // Glowing eyes.
  rect(g, x + 6, y + 10, 4, 3, p.fire[2]);
  rect(g, x + 14, y + 10, 4, 3, p.fire[2]);
  rect(g, x + 7, y + 11, 2, 1, p.fire[3]);
  rect(g, x + 15, y + 11, 2, 1, p.fire[3]);
  // Nose / centre piece.
  rect(g, x + 11, y + 14, 2, 4, p.metal[1]);
  // Fanged mouth.
  rect(g, x + 6, y + 18, 12, 3, p.stone[0]);
  px(g, x + 7, y + 21, p.text[3]);
  px(g, x + 9, y + 22, p.text[3]);
  px(g, x + 14, y + 22, p.text[3]);
  px(g, x + 16, y + 21, p.text[3]);
  // Lower runes.
  rect(g, x + 9, y + 24, 6, 1, p.accent[2]);
  px(g, x + 11, y + 25, p.accent[3]);
  px(g, x + 12, y + 25, p.accent[3]);
};

const paintTempleRune = (
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: "circle" | "spiral",
  p: ThemePalette,
): void => {
  if (kind === "circle") {
    // 6×6 ringed rune.
    rect(g, x + 1, y, 4, 1, p.metal[1]);
    rect(g, x + 1, y + 5, 4, 1, p.metal[1]);
    rect(g, x, y + 1, 1, 4, p.metal[1]);
    rect(g, x + 5, y + 1, 1, 4, p.metal[1]);
    rect(g, x + 2, y + 2, 2, 2, p.metal[2]);
    px(g, x + 2, y + 2, p.metal[3]);
  } else {
    // 6×6 spiral
    rect(g, x, y + 2, 6, 1, p.metal[1]);
    rect(g, x + 2, y, 1, 6, p.metal[1]);
    rect(g, x + 4, y + 1, 1, 4, p.metal[1]);
    rect(g, x + 1, y + 4, 4, 1, p.metal[2]);
    px(g, x + 3, y + 3, p.metal[3]);
  }
};

// FNV-ish seed combining theme and side. Keeps the two panels of a
// theme visually distinct without producing a stark mirror.
const seedOf = (theme: ThemeId, side: FrameSide): number => {
  let h = 0x9e3779b1;
  for (let i = 0; i < theme.length; i++) {
    h = Math.imul(h ^ theme.charCodeAt(i), 0x01000193);
  }
  h = Math.imul(h ^ (side === "left" ? 0x4c45_4654 : 0x5249_4748), 0x01000193);
  return (h ^ (h >>> 13)) >>> 0;
};

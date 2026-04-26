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
import { newCanvas, px, rect, vGradient } from "./canvas.js";
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
// Phase 10.5b — simplified: clean stone pillar with ONE focal
// mascaron at vertical centre. No more 3 stacked faces (user feedback:
// they read as "stamp grid"). Cap top + bottom are subtle wood bands.
const paintSacredFrame = (
  g: CanvasRenderingContext2D,
  p: ThemePalette,
  side: FrameSide,
): void => {
  void side;

  // Top wood-band cap (8 px) — subtle, no carved-face look.
  rect(g, 0, 0, FRAME_PANEL_W, 8, p.wood[1]);
  rect(g, 0, 0, FRAME_PANEL_W, 1, p.wood[2]);
  rect(g, 0, 7, FRAME_PANEL_W, 1, p.wood[0]);
  rect(g, 0, 3, FRAME_PANEL_W, 1, p.metal[1]); // single gold pinstripe

  // Bottom wood-band cap (8 px).
  rect(g, 0, FRAME_PANEL_H - 8, FRAME_PANEL_W, 8, p.wood[1]);
  rect(g, 0, FRAME_PANEL_H - 8, FRAME_PANEL_W, 1, p.wood[2]);
  rect(g, 0, FRAME_PANEL_H - 1, FRAME_PANEL_W, 1, p.wood[0]);
  rect(g, 0, FRAME_PANEL_H - 5, FRAME_PANEL_W, 1, p.metal[1]);

  // ONE focal leaf mascaron at vertical centre — y=125 puts it
  // exactly mid-frame (270 height, 20 face height → centre 125).
  paintLeafMascaron(g, 8, 125, p);

  // Two horizontal stone courses framing the mascaron — break the
  // empty space without re-introducing repetition.
  rect(g, 0, 60, FRAME_PANEL_W, 1, p.stone[0]);
  rect(g, 0, 61, FRAME_PANEL_W, 1, p.stone[2]);
  rect(g, 0, 200, FRAME_PANEL_W, 1, p.stone[0]);
  rect(g, 0, 201, FRAME_PANEL_W, 1, p.stone[2]);
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
  void side;

  // Phase 10.5b — simplified: clean cold-stone pillar with ONE focal
  // banner mid-frame. No more icicle clusters, no scattered snow, no
  // marble vein noise — those all read as visual chaos at frame size.

  // Top stone cap with snow (8 px) — subtle.
  rect(g, 0, 0, FRAME_PANEL_W, 8, p.stone[2]);
  rect(g, 0, 0, FRAME_PANEL_W, 3, p.accent[3]); // snow
  rect(g, 0, 3, FRAME_PANEL_W, 1, p.accent[2]);

  // Bottom stone cap (8 px).
  rect(g, 0, FRAME_PANEL_H - 8, FRAME_PANEL_W, 8, p.stone[2]);
  rect(g, 0, FRAME_PANEL_H - 1, FRAME_PANEL_W, 1, p.stone[0]);

  // ONE banner draped at vertical centre.
  paintHangingBanner(g, side, p);

  // Two horizontal courses framing the banner.
  rect(g, 0, 60, FRAME_PANEL_W, 1, p.stone[0]);
  rect(g, 0, 200, FRAME_PANEL_W, 1, p.stone[0]);
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
  void side;

  // Phase 10.5b — simplified: ONE big mascaron at vertical centre,
  // gold trim borders, no rune row, no embers cluster, no double
  // mascaron stack.

  // Top ornamental cap — gold scrollwork (12 px).
  rect(g, 0, 0, FRAME_PANEL_W, 12, p.stone[0]);
  rect(g, 2, 2, FRAME_PANEL_W - 4, 8, p.metal[1]);
  rect(g, 2, 2, FRAME_PANEL_W - 4, 1, p.metal[2]);
  // Cyan magic gem in the cap.
  rect(g, 14, 4, 4, 4, p.accent[2]);
  px(g, 15, 4, p.accent[3]);

  // Bottom ornamental cap — mirror.
  const cy = FRAME_PANEL_H - 12;
  rect(g, 0, cy, FRAME_PANEL_W, 12, p.stone[0]);
  rect(g, 2, cy + 2, FRAME_PANEL_W - 4, 8, p.metal[1]);
  rect(g, 2, cy + 2, FRAME_PANEL_W - 4, 1, p.metal[2]);
  rect(g, 14, cy + 4, 4, 4, p.accent[2]);
  px(g, 15, cy + 4, p.accent[3]);

  // ONE big mayan mascaron centred — y=120 places the 30-tall face
  // mid-frame (270/2 - 15 = 120).
  paintTempleMascaron(g, 4, 120, p);

  // Two horizontal courses framing the mascaron.
  rect(g, 0, 100, FRAME_PANEL_W, 1, p.metal[0]);
  rect(g, 0, 160, FRAME_PANEL_W, 1, p.metal[0]);
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

// Phase 10.5b — `paintTempleRune` and `seedOf` helpers were removed
// alongside the rune-row/embers clutter; the simplified frames don't
// need a per-side PRNG since they have a single deterministic focal
// element each.

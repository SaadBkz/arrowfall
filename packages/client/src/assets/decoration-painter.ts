// Phase 10 iter-2 — Decoration painter. These are non-grid sprites
// that the spawner places contextually around the map (above platform
// tops, under ceilings, in corners). They live in a dedicated layer
// above the tilemap so the screen reads like TowerFall's hand-placed
// arenas instead of a sterile algorithmic grid.
//
// Each theme has a kit of ~7 decos covering top/bottom/free contexts:
//   torch / banner / chain / idol / stalactite / gold-panel / statue.
//
// Sizes vary (4×4 small sigil → 64×80 giant idol). Anchor-by-default
// at top-left; the spawner positions in raw px with optional pivot
// adjustments (chains hang from top, stalactites point down, etc.).

import type { ThemeId } from "@arrowfall/shared";
import { newCanvas, px, rect } from "./canvas.js";
import { PALETTES, type ThemePalette } from "./palettes.js";

export type DecorationKind =
  // Sacred Grove
  | "sg_torch"
  | "sg_vines_short"
  | "sg_vines_long"
  | "sg_mushroom"
  | "sg_branch"
  | "sg_idol"
  | "sg_carved_face"
  // Twin Spires
  | "ts_banner_red"
  | "ts_icicle_small"
  | "ts_icicle_large"
  | "ts_lantern"
  | "ts_crystal"
  | "ts_idol"
  | "ts_carved_face"
  // Old Temple
  | "ot_torch"
  | "ot_chain_short"
  | "ot_chain_long"
  | "ot_sigil"
  | "ot_idol"
  | "ot_carved_face"
  | "ot_gold_panel";

export type DecorationSpriteKey = DecorationKind;

export const buildDecorationSprites = (
  theme: ThemeId,
): Map<DecorationSpriteKey, HTMLCanvasElement> => {
  const out = new Map<DecorationSpriteKey, HTMLCanvasElement>();
  const p = PALETTES[theme];

  switch (theme) {
    case "sacred-grove":
      out.set("sg_torch", paintSacredTorch(p));
      out.set("sg_vines_short", paintSacredVines(p, 12));
      out.set("sg_vines_long", paintSacredVines(p, 24));
      out.set("sg_mushroom", paintSacredMushroom(p));
      out.set("sg_branch", paintSacredBranch(p));
      out.set("sg_idol", paintSacredIdol(p));
      out.set("sg_carved_face", paintSacredCarvedFace(p));
      break;
    case "twin-spires":
      out.set("ts_banner_red", paintSpiresBanner(p));
      out.set("ts_icicle_small", paintSpiresIcicle(p, 12));
      out.set("ts_icicle_large", paintSpiresIcicle(p, 22));
      out.set("ts_lantern", paintSpiresLantern(p));
      out.set("ts_crystal", paintSpiresCrystal(p));
      out.set("ts_idol", paintSpiresIdol(p));
      out.set("ts_carved_face", paintSpiresCarvedFace(p));
      break;
    case "old-temple":
      out.set("ot_torch", paintTempleTorch(p));
      out.set("ot_chain_short", paintTempleChain(p, 16));
      out.set("ot_chain_long", paintTempleChain(p, 32));
      out.set("ot_sigil", paintTempleSigil(p));
      out.set("ot_idol", paintTempleIdol(p));
      out.set("ot_carved_face", paintTempleCarvedFace(p));
      out.set("ot_gold_panel", paintTempleGoldPanel(p));
      break;
  }
  return out;
};

// ── Sacred Grove ─────────────────────────────────────────────────

const paintSacredTorch = (p: ThemePalette): HTMLCanvasElement => {
  // 6×14 — wood post + flame on top. Anchor: bottom centre.
  const cv = newCanvas(6, 14);
  const g = cv.getContext("2d")!;
  // Post (6 px tall).
  rect(g, 2, 8, 2, 6, p.wood[1]);
  rect(g, 2, 8, 1, 6, p.wood[2]);
  rect(g, 3, 8, 1, 6, p.wood[0]);
  // Mounting bracket.
  rect(g, 1, 7, 4, 1, p.metal[1]);
  rect(g, 0, 8, 1, 2, p.metal[1]);
  rect(g, 5, 8, 1, 2, p.metal[1]);
  // Flame — 4 px tall.
  px(g, 2, 6, p.fire[1]);
  px(g, 3, 6, p.fire[2]);
  rect(g, 1, 4, 4, 2, p.fire[2]);
  rect(g, 2, 3, 2, 1, p.fire[3]);
  px(g, 2, 2, p.metal[3]);
  px(g, 3, 2, p.metal[3]);
  px(g, 2, 1, p.metal[2]);
  return cv;
};

const paintSacredVines = (p: ThemePalette, h: number): HTMLCanvasElement => {
  const cv = newCanvas(8, h);
  const g = cv.getContext("2d")!;
  // Two snaking vines + scattered leaves.
  for (let y = 0; y < h; y++) {
    const xL = 2 + (Math.sin(y * 0.5) > 0 ? 1 : 0);
    const xR = 5 + (Math.cos(y * 0.4) > 0 ? 1 : 0);
    px(g, xL, y, p.accent[0]);
    px(g, xR, y, p.accent[1]);
    if (y % 4 === 1) {
      px(g, xL - 1, y, p.accent[2]);
      px(g, xL - 2, y, p.accent[3]);
    }
    if (y % 5 === 3) {
      px(g, xR + 1, y, p.accent[2]);
      px(g, xR + 2, y, p.accent[3]);
    }
  }
  // Anchor at top (the spawner places it just below ceiling).
  return cv;
};

const paintSacredMushroom = (p: ThemePalette): HTMLCanvasElement => {
  const cv = newCanvas(8, 8);
  const g = cv.getContext("2d")!;
  // Stem.
  rect(g, 3, 5, 2, 3, p.text[2]);
  // Cap.
  rect(g, 1, 2, 6, 3, p.fire[2]);
  rect(g, 1, 2, 6, 1, p.fire[1]);
  // Spots.
  px(g, 2, 3, p.text[3]);
  px(g, 5, 3, p.text[3]);
  px(g, 4, 4, p.text[3]);
  return cv;
};

const paintSacredBranch = (p: ThemePalette): HTMLCanvasElement => {
  const cv = newCanvas(20, 8);
  const g = cv.getContext("2d")!;
  // Branch line.
  rect(g, 0, 4, 18, 1, p.wood[1]);
  rect(g, 0, 5, 18, 1, p.wood[0]);
  // Leaf bundles.
  rect(g, 4, 1, 4, 3, p.accent[1]);
  rect(g, 5, 0, 2, 1, p.accent[2]);
  rect(g, 12, 1, 5, 3, p.accent[1]);
  rect(g, 14, 0, 2, 1, p.accent[2]);
  // Highlight.
  px(g, 6, 2, p.accent[3]);
  px(g, 14, 2, p.accent[3]);
  return cv;
};

const paintSacredIdol = (p: ThemePalette): HTMLCanvasElement => {
  // 24×40 large statue silhouette. Anchored at base centre.
  const cv = newCanvas(24, 40);
  const g = cv.getContext("2d")!;
  // Pedestal.
  rect(g, 2, 36, 20, 4, p.stone[0]);
  rect(g, 2, 36, 20, 1, p.stone[1]);
  // Body — robed figure.
  rect(g, 6, 18, 12, 18, p.stone[0]);
  rect(g, 5, 22, 14, 14, p.stone[0]);
  // Robe folds (mossy highlights).
  rect(g, 7, 24, 1, 10, p.accent[0]);
  rect(g, 11, 24, 1, 10, p.accent[0]);
  rect(g, 16, 24, 1, 10, p.accent[0]);
  // Head.
  rect(g, 9, 8, 6, 10, p.stone[0]);
  rect(g, 8, 10, 8, 6, p.stone[0]);
  // Crown of leaves.
  rect(g, 7, 6, 10, 2, p.accent[1]);
  px(g, 11, 4, p.accent[1]);
  px(g, 12, 4, p.accent[1]);
  px(g, 11, 3, p.accent[2]);
  // Eyes — softly glowing gold.
  px(g, 10, 12, p.metal[3]);
  px(g, 13, 12, p.metal[3]);
  // Side wings of cape.
  rect(g, 3, 24, 2, 12, p.stone[0]);
  rect(g, 19, 24, 2, 12, p.stone[0]);
  // Moss patches over time.
  px(g, 5, 30, p.accent[2]);
  px(g, 18, 28, p.accent[2]);
  px(g, 8, 36, p.accent[1]);
  return cv;
};

const paintSacredCarvedFace = (p: ThemePalette): HTMLCanvasElement => {
  // 16×16 — a relief face on a SOLID block. Used to replace random tiles.
  const cv = newCanvas(16, 16);
  const g = cv.getContext("2d")!;
  // Base (lighter than surrounding stone).
  rect(g, 0, 0, 16, 16, p.stone[1]);
  rect(g, 0, 0, 16, 1, p.stone[2]);
  rect(g, 0, 15, 16, 1, p.stone[0]);
  // Face — round, almost cherubic.
  rect(g, 4, 4, 8, 8, p.stone[2]);
  rect(g, 5, 3, 6, 1, p.stone[3]);
  rect(g, 5, 12, 6, 1, p.stone[0]);
  // Eyes (closed slits, gold).
  rect(g, 5, 7, 2, 1, p.metal[2]);
  rect(g, 9, 7, 2, 1, p.metal[2]);
  // Mouth.
  rect(g, 7, 10, 2, 1, p.stone[0]);
  // Vines crawling.
  px(g, 1, 5, p.accent[1]);
  px(g, 2, 4, p.accent[1]);
  px(g, 14, 11, p.accent[1]);
  px(g, 13, 10, p.accent[2]);
  return cv;
};

// ── Twin Spires ──────────────────────────────────────────────────

const paintSpiresBanner = (p: ThemePalette): HTMLCanvasElement => {
  // 8×20 — red banner pendant from ceiling. Anchored at top centre.
  const cv = newCanvas(8, 20);
  const g = cv.getContext("2d")!;
  // Top rod.
  rect(g, 0, 0, 8, 1, p.fire[1]); // gold rod
  rect(g, 0, 1, 8, 1, p.wood[0]);
  // Banner body.
  rect(g, 1, 2, 6, 14, p.metal[2]); // red
  rect(g, 1, 2, 6, 1, p.metal[3]);
  rect(g, 1, 15, 6, 1, p.metal[1]);
  rect(g, 1, 2, 1, 14, p.metal[1]);
  rect(g, 6, 2, 1, 14, p.metal[1]);
  // Crest (gold).
  rect(g, 3, 6, 2, 4, p.fire[2]);
  px(g, 3, 5, p.fire[1]);
  px(g, 4, 5, p.fire[1]);
  // V-cut bottom.
  rect(g, 1, 16, 6, 1, p.metal[2]);
  rect(g, 2, 17, 4, 1, p.metal[2]);
  px(g, 3, 18, p.metal[1]);
  px(g, 4, 18, p.metal[1]);
  return cv;
};

const paintSpiresIcicle = (p: ThemePalette, h: number): HTMLCanvasElement => {
  // Width tapers from 4 → 1 over height. Anchored at top centre.
  const cv = newCanvas(4, h);
  const g = cv.getContext("2d")!;
  for (let y = 0; y < h; y++) {
    const t = y / h;
    const w = Math.max(1, Math.round((1 - t) * 4));
    const x = Math.floor((4 - w) / 2);
    rect(g, x, y, w, 1, p.accent[2]);
    if (w >= 2) {
      px(g, x, y, p.accent[3]);
    }
  }
  // Tip drip pixel.
  px(g, 2, h - 1, p.text[3]);
  return cv;
};

const paintSpiresLantern = (p: ThemePalette): HTMLCanvasElement => {
  // 6×10 — hanging lantern with glow.
  const cv = newCanvas(6, 10);
  const g = cv.getContext("2d")!;
  // Chain top.
  px(g, 2, 0, p.metal[0]);
  px(g, 3, 0, p.metal[0]);
  px(g, 2, 1, p.metal[0]);
  px(g, 3, 1, p.metal[0]);
  // Cap.
  rect(g, 1, 2, 4, 1, p.fire[1]);
  // Glass body.
  rect(g, 1, 3, 4, 5, p.fire[3]);
  rect(g, 2, 4, 2, 3, p.text[3]); // bright filament
  rect(g, 0, 3, 1, 5, p.fire[0]);
  rect(g, 5, 3, 1, 5, p.fire[0]);
  // Bottom cap.
  rect(g, 1, 8, 4, 1, p.fire[1]);
  px(g, 2, 9, p.fire[0]);
  px(g, 3, 9, p.fire[0]);
  return cv;
};

const paintSpiresCrystal = (p: ThemePalette): HTMLCanvasElement => {
  // 6×8 — small ground crystal.
  const cv = newCanvas(6, 8);
  const g = cv.getContext("2d")!;
  // Vertical shard.
  rect(g, 2, 1, 2, 5, p.accent[2]);
  rect(g, 2, 1, 1, 5, p.accent[3]);
  // Tip.
  px(g, 2, 0, p.text[3]);
  px(g, 3, 0, p.text[3]);
  // Side shard.
  rect(g, 0, 4, 2, 3, p.accent[1]);
  rect(g, 4, 5, 2, 2, p.accent[1]);
  // Base.
  rect(g, 0, 7, 6, 1, p.stone[1]);
  return cv;
};

const paintSpiresIdol = (p: ThemePalette): HTMLCanvasElement => {
  // 24×40 — frozen monolith with eyes.
  const cv = newCanvas(24, 40);
  const g = cv.getContext("2d")!;
  // Base.
  rect(g, 2, 36, 20, 4, p.stone[0]);
  rect(g, 2, 36, 20, 1, p.stone[1]);
  // Body.
  rect(g, 5, 12, 14, 24, p.stone[1]);
  rect(g, 5, 12, 14, 1, p.stone[2]);
  rect(g, 5, 35, 14, 1, p.stone[0]);
  rect(g, 4, 14, 1, 22, p.stone[0]);
  rect(g, 19, 14, 1, 22, p.stone[0]);
  // Frosting at top + sides.
  rect(g, 3, 11, 18, 2, p.accent[3]);
  rect(g, 3, 13, 18, 1, p.accent[2]);
  // Frost streams down.
  px(g, 6, 18, p.accent[2]);
  px(g, 6, 19, p.accent[2]);
  px(g, 17, 22, p.accent[2]);
  px(g, 17, 23, p.accent[2]);
  // Engraved face.
  rect(g, 8, 16, 8, 12, p.stone[0]);
  rect(g, 9, 17, 6, 10, p.stone[2]);
  // Glowing icy eyes.
  rect(g, 9, 19, 2, 2, p.text[3]);
  rect(g, 13, 19, 2, 2, p.text[3]);
  // Mouth.
  rect(g, 10, 24, 4, 1, p.stone[0]);
  // Banner draped on side.
  rect(g, 0, 18, 4, 14, p.metal[2]);
  rect(g, 0, 18, 1, 14, p.metal[1]);
  rect(g, 1, 23, 2, 2, p.metal[3]);
  return cv;
};

const paintSpiresCarvedFace = (p: ThemePalette): HTMLCanvasElement => {
  // 16×16 — frozen face plate set into a SOLID block.
  const cv = newCanvas(16, 16);
  const g = cv.getContext("2d")!;
  rect(g, 0, 0, 16, 16, p.stone[2]);
  rect(g, 0, 0, 16, 1, p.stone[3]);
  rect(g, 0, 15, 16, 1, p.stone[0]);
  // Frost crown.
  rect(g, 0, 0, 16, 2, p.accent[3]);
  // Carved face.
  rect(g, 4, 4, 8, 8, p.stone[1]);
  rect(g, 5, 5, 6, 6, p.stone[0]);
  // Glowing eyes.
  rect(g, 5, 7, 2, 1, p.accent[3]);
  rect(g, 9, 7, 2, 1, p.accent[3]);
  // Triangular nose.
  px(g, 7, 8, p.stone[2]);
  px(g, 8, 8, p.stone[2]);
  // Mouth (downturned).
  rect(g, 6, 10, 4, 1, p.stone[0]);
  // Banner sigil bottom.
  px(g, 7, 13, p.metal[2]);
  px(g, 8, 13, p.metal[2]);
  return cv;
};

// ── Old Temple ───────────────────────────────────────────────────

const paintTempleTorch = (p: ThemePalette): HTMLCanvasElement => {
  // 8×16 — golden bracket + bowl + flame.
  const cv = newCanvas(8, 16);
  const g = cv.getContext("2d")!;
  // Bracket bolted to wall.
  rect(g, 0, 8, 1, 6, p.metal[1]);
  rect(g, 1, 9, 2, 1, p.metal[2]);
  rect(g, 1, 12, 2, 1, p.metal[2]);
  // Bowl.
  rect(g, 2, 9, 5, 3, p.metal[1]);
  rect(g, 2, 9, 5, 1, p.metal[2]);
  rect(g, 2, 11, 5, 1, p.metal[0]);
  // Flame.
  rect(g, 3, 5, 3, 4, p.fire[2]);
  rect(g, 3, 4, 3, 1, p.fire[3]);
  px(g, 4, 3, p.metal[3]);
  px(g, 4, 2, p.metal[3]);
  px(g, 4, 1, p.metal[2]);
  // Glow halo (faint, alpha).
  g.globalAlpha = 0.3;
  rect(g, 1, 4, 7, 6, p.fire[3]);
  g.globalAlpha = 1;
  return cv;
};

const paintTempleChain = (p: ThemePalette, h: number): HTMLCanvasElement => {
  const cv = newCanvas(4, h);
  const g = cv.getContext("2d")!;
  // Alternating link pattern.
  for (let y = 0; y < h; y += 4) {
    // Horizontal link.
    rect(g, 0, y, 4, 1, p.metal[0]);
    rect(g, 0, y + 1, 4, 1, p.metal[1]);
    px(g, 1, y, p.metal[2]);
    // Vertical link (next 2 px).
    if (y + 3 < h) {
      rect(g, 1, y + 2, 2, 2, p.metal[0]);
      px(g, 1, y + 2, p.metal[1]);
    }
  }
  return cv;
};

const paintTempleSigil = (p: ThemePalette): HTMLCanvasElement => {
  // 8×8 — floating cyan sigil.
  const cv = newCanvas(8, 8);
  const g = cv.getContext("2d")!;
  // Outer ring.
  px(g, 3, 0, p.accent[2]);
  px(g, 4, 0, p.accent[2]);
  px(g, 0, 3, p.accent[2]);
  px(g, 0, 4, p.accent[2]);
  px(g, 7, 3, p.accent[2]);
  px(g, 7, 4, p.accent[2]);
  px(g, 3, 7, p.accent[2]);
  px(g, 4, 7, p.accent[2]);
  px(g, 1, 1, p.accent[1]);
  px(g, 6, 1, p.accent[1]);
  px(g, 1, 6, p.accent[1]);
  px(g, 6, 6, p.accent[1]);
  // Cross inside.
  rect(g, 3, 2, 2, 4, p.accent[3]);
  rect(g, 2, 3, 4, 2, p.accent[3]);
  // Spec.
  px(g, 3, 3, p.text[3]);
  return cv;
};

const paintTempleIdol = (p: ThemePalette): HTMLCanvasElement => {
  // 32×56 — large mayan god figure. Anchored at base centre.
  const cv = newCanvas(32, 56);
  const g = cv.getContext("2d")!;
  // Base steps.
  rect(g, 2, 50, 28, 6, p.stone[0]);
  rect(g, 0, 54, 32, 2, p.stone[0]);
  rect(g, 2, 50, 28, 1, p.metal[1]);
  // Lower body — broad shoulders.
  rect(g, 5, 30, 22, 20, p.stone[1]);
  rect(g, 4, 32, 1, 18, p.stone[0]);
  rect(g, 27, 32, 1, 18, p.stone[0]);
  rect(g, 5, 49, 22, 1, p.stone[0]);
  // Gold belt.
  rect(g, 5, 38, 22, 3, p.metal[1]);
  rect(g, 5, 38, 22, 1, p.metal[2]);
  rect(g, 5, 40, 22, 1, p.metal[0]);
  // Belt sigil.
  rect(g, 14, 39, 4, 1, p.accent[2]);
  // Arms hanging.
  rect(g, 2, 32, 3, 14, p.stone[1]);
  rect(g, 27, 32, 3, 14, p.stone[1]);
  // Head — wide.
  rect(g, 7, 12, 18, 18, p.stone[1]);
  rect(g, 6, 14, 1, 14, p.stone[0]);
  rect(g, 25, 14, 1, 14, p.stone[0]);
  rect(g, 7, 12, 18, 1, p.stone[2]);
  // Headdress (gold + cyan).
  rect(g, 5, 6, 22, 6, p.metal[1]);
  rect(g, 5, 6, 22, 1, p.metal[2]);
  rect(g, 9, 0, 14, 6, p.metal[1]);
  rect(g, 11, 0, 10, 1, p.metal[2]);
  rect(g, 13, 2, 2, 4, p.accent[2]);
  rect(g, 17, 2, 2, 4, p.accent[2]);
  px(g, 16, 3, p.accent[3]);
  // Side feathers.
  rect(g, 0, 8, 5, 8, p.metal[1]);
  rect(g, 27, 8, 5, 8, p.metal[1]);
  rect(g, 1, 9, 1, 6, p.accent[2]);
  rect(g, 30, 9, 1, 6, p.accent[2]);
  // Face.
  rect(g, 10, 16, 12, 12, p.stone[0]);
  rect(g, 11, 17, 10, 10, p.stone[2]);
  // Glowing eyes.
  rect(g, 12, 19, 3, 2, p.fire[3]);
  rect(g, 17, 19, 3, 2, p.fire[3]);
  // Nose plate.
  rect(g, 15, 22, 2, 3, p.metal[1]);
  // Fanged mouth.
  rect(g, 12, 25, 8, 2, p.stone[0]);
  px(g, 13, 26, p.text[3]);
  px(g, 15, 27, p.text[3]);
  px(g, 17, 27, p.text[3]);
  px(g, 18, 26, p.text[3]);
  // Pectoral sigil.
  rect(g, 13, 33, 6, 4, p.accent[1]);
  px(g, 15, 34, p.accent[3]);
  px(g, 16, 34, p.accent[3]);
  px(g, 15, 35, p.accent[3]);
  px(g, 16, 35, p.accent[3]);
  return cv;
};

const paintTempleCarvedFace = (p: ThemePalette): HTMLCanvasElement => {
  // 16×16 — mayan-style face plate replacing a SOLID tile.
  const cv = newCanvas(16, 16);
  const g = cv.getContext("2d")!;
  // Tile bevel.
  rect(g, 0, 0, 16, 16, p.stone[2]);
  rect(g, 0, 0, 16, 1, p.stone[3]);
  rect(g, 0, 15, 16, 1, p.stone[0]);
  rect(g, 0, 0, 1, 16, p.stone[0]);
  rect(g, 15, 0, 1, 16, p.stone[0]);
  // Gold trim around face.
  rect(g, 1, 1, 14, 1, p.metal[1]);
  rect(g, 1, 14, 14, 1, p.metal[1]);
  rect(g, 1, 1, 1, 14, p.metal[1]);
  rect(g, 14, 1, 1, 14, p.metal[1]);
  // Face background.
  rect(g, 2, 2, 12, 12, p.stone[1]);
  // Eyes — glowing orange.
  rect(g, 4, 5, 3, 2, p.fire[2]);
  rect(g, 9, 5, 3, 2, p.fire[2]);
  px(g, 5, 5, p.fire[3]);
  px(g, 10, 5, p.fire[3]);
  // Nose.
  rect(g, 7, 7, 2, 3, p.metal[1]);
  // Fanged mouth.
  rect(g, 4, 10, 8, 2, p.stone[0]);
  px(g, 5, 12, p.text[3]);
  px(g, 7, 12, p.text[3]);
  px(g, 9, 12, p.text[3]);
  px(g, 11, 12, p.text[3]);
  // Cyan rune in forehead.
  px(g, 7, 3, p.accent[2]);
  px(g, 8, 3, p.accent[2]);
  return cv;
};

const paintTempleGoldPanel = (p: ThemePalette): HTMLCanvasElement => {
  // 16×4 — gold trim that goes on top of JUMPTHRU platforms.
  const cv = newCanvas(16, 4);
  const g = cv.getContext("2d")!;
  rect(g, 0, 0, 16, 4, p.metal[1]);
  rect(g, 0, 0, 16, 1, p.metal[2]);
  rect(g, 0, 3, 16, 1, p.metal[0]);
  // Geometric pattern.
  for (let i = 1; i < 15; i += 3) {
    px(g, i, 1, p.metal[3]);
    px(g, i, 2, p.metal[0]);
  }
  // Glyphs.
  rect(g, 4, 1, 2, 2, p.accent[1]);
  rect(g, 10, 1, 2, 2, p.accent[1]);
  return cv;
};

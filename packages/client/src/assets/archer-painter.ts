// Phase 10 — Archer painter. Generates ~32 frames per archer skin
// covering all the animation states the renderer can request:
//
//   idle 4 / walk 6 / jump 1 / fall 1 / dodge 4 / aim ×8 / shoot 3 / death 4
//
// Sprite is 16×16 px. Archer body sits roughly in x=4..11, y=2..14
// (8×13 px), so the silhouette overflows the 8×11 collider by ±2 px
// vertically — bigger sprite reads better, gameplay collider stays
// honest. The renderer offsets the sprite so collider top-left aligns
// with `archer.pos`.
//
// Each skin gets a distinctive head shape so even a colour-blind
// player can tell archers apart at a glance:
//   verdant  → leaf hood (single tip pixel up)
//   crimson  → vertical plume (3 px tall)
//   azure    → pointed hood (2 px tip)
//   saffron  → flat-brim hat (3 px wide brim)
//   onyx     → full hood + bright mask (eye row only)
//   frost    → diadem (2 horizontal bright pixels)

import { newCanvas, px, rect } from "./canvas.js";
import { ARCHER_SKINS, type ArcherPalette, type ArcherSkinId } from "./palettes.js";

export const ARCHER_SPRITE_SIZE = 16;

// Pixel offset between archer.pos (top-left of 8×11 hitbox) and the
// sprite top-left after rendering. The sprite extends 4 px to the
// left of the hitbox (cape) and 2 px above (head/plume).
export const ARCHER_SPRITE_OX = -4;
export const ARCHER_SPRITE_OY = -2;

export type AimDir = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export const AIM_DIRS: ReadonlyArray<AimDir> = [
  "N",
  "NE",
  "E",
  "SE",
  "S",
  "SW",
  "W",
  "NW",
];

export type ArcherSpriteKey =
  | `${ArcherSkinId}_idle_${number}`
  | `${ArcherSkinId}_walk_${number}`
  | `${ArcherSkinId}_jump`
  | `${ArcherSkinId}_fall`
  | `${ArcherSkinId}_dodge_${number}`
  | `${ArcherSkinId}_aim_${AimDir}`
  | `${ArcherSkinId}_shoot_${number}`
  | `${ArcherSkinId}_death_${number}`;

export const buildArcherSprites = (
  skinId: ArcherSkinId,
): Map<ArcherSpriteKey, HTMLCanvasElement> => {
  const out = new Map<ArcherSpriteKey, HTMLCanvasElement>();
  const p = ARCHER_SKINS[skinId];

  // Idle 4 frames — vertical body bob.
  const idleBob = [0, -1, 0, 1];
  for (let f = 0; f < 4; f++) {
    out.set(`${skinId}_idle_${f}`, paintBody(p, skinId, { bobY: idleBob[f]! }));
  }

  // Walk 6 frames — leg alternates + slight body bob.
  const walkBob = [0, -1, 0, 0, -1, 0];
  for (let f = 0; f < 6; f++) {
    out.set(
      `${skinId}_walk_${f}`,
      paintBody(p, skinId, { bobY: walkBob[f]!, walk: f }),
    );
  }

  // Jump (knees up) and fall (knees out).
  out.set(`${skinId}_jump`, paintBody(p, skinId, { pose: "jump" }));
  out.set(`${skinId}_fall`, paintBody(p, skinId, { pose: "fall" }));

  // Dodge 4 frames — body lean + motion streaks.
  for (let f = 0; f < 4; f++) {
    out.set(`${skinId}_dodge_${f}`, paintBody(p, skinId, { dodge: f }));
  }

  // Aim 8 directions — body idle + bow drawn at the corresponding angle.
  for (const dir of AIM_DIRS) {
    out.set(`${skinId}_aim_${dir}`, paintBody(p, skinId, { aim: dir }));
  }

  // Shoot 3 frames — quick recoil over a static aim east pose.
  for (let f = 0; f < 3; f++) {
    out.set(
      `${skinId}_shoot_${f}`,
      paintBody(p, skinId, { aim: "E", shoot: f }),
    );
  }

  // Death 4 frames — fragmenting body, alpha fades out.
  for (let f = 0; f < 4; f++) {
    out.set(`${skinId}_death_${f}`, paintDeath(p, f));
  }

  return out;
};

// Single flat pose type — all fields optional. Cleaner than a discriminated
// union for our needs (TS narrowing across nested optionals is fiddly when
// noUncheckedIndexedAccess is on).
type Pose = {
  readonly bobY?: number;
  readonly walk?: number;
  readonly pose?: "jump" | "fall";
  readonly dodge?: number;
  readonly aim?: AimDir;
  readonly shoot?: number;
};

const paintBody = (
  p: ArcherPalette,
  _skin: ArcherSkinId,
  pose: Pose,
): HTMLCanvasElement => {
  const cv = newCanvas(ARCHER_SPRITE_SIZE, ARCHER_SPRITE_SIZE);
  const g = cv.getContext("2d")!;

  const bobY = pose.bobY ?? 0;
  const isJump = pose.pose === "jump";
  const isFall = pose.pose === "fall";
  const dodgeFrame = pose.dodge ?? -1;
  const aim: AimDir | null = pose.aim ?? null;
  const shootFrame = pose.shoot ?? -1;
  const walkFrame = pose.walk ?? -1;

  // Body x range: 5..10 (6 px wide for body, allows space for cape on
  // the left and bow on the right). Sprite is centred at x=8.
  const bx = 5;
  const bw = 6;

  // Head + body Y top, before bobbing.
  const headY = 3 + bobY;
  const bodyY = 6 + bobY;

  // Cape — appears on the left of the body, swaying with bob/walk.
  paintCape(g, p, bodyY, walkFrame >= 0 ? walkFrame : 0, dodgeFrame);

  // Body / torso — 6 wide × 5 tall (chest + belt).
  rect(g, bx, bodyY, bw, 5, p.body);
  // Body shading — right edge darker.
  rect(g, bx + bw - 1, bodyY, 1, 5, p.bodyShade);
  // Body highlight — left edge lighter.
  rect(g, bx, bodyY, 1, 5, p.bodyLight);
  // Belt — 1 px row of accent.
  rect(g, bx, bodyY + 3, bw, 1, p.accent);

  // Legs — variant per pose.
  paintLegs(g, p, bx, bodyY + 5, isJump, isFall, walkFrame);

  // Head — square 5×4, with face row.
  paintHead(g, p, headY, _skin);

  // Bow / aim arm.
  if (aim !== null) {
    paintBow(g, p, aim, shootFrame);
  } else if (dodgeFrame >= 0) {
    paintDodgeStreaks(g, p, dodgeFrame);
  } else {
    // Default rest bow at side.
    px(g, bx + bw, bodyY + 1, p.bow);
    px(g, bx + bw + 1, bodyY + 2, p.bow);
  }

  return cv;
};

const paintCape = (
  g: CanvasRenderingContext2D,
  p: ArcherPalette,
  bodyY: number,
  walkFrame: number,
  dodgeFrame: number,
): void => {
  // Cape hangs left of the body, 2 px wide × 6 tall.
  const sway = dodgeFrame >= 0 ? 2 : (walkFrame % 2 === 0 ? 0 : 1);
  const cx = 4 - sway;
  rect(g, cx, bodyY - 1, 2, 7, p.cape);
  rect(g, cx, bodyY - 1, 1, 7, p.capeShade);
  // Bottom flare.
  px(g, cx - 1, bodyY + 6, p.cape);
  px(g, cx + 2, bodyY + 6, p.capeShade);
};

const paintLegs = (
  g: CanvasRenderingContext2D,
  p: ArcherPalette,
  bx: number,
  legsY: number,
  isJump: boolean,
  isFall: boolean,
  walkFrame: number,
): void => {
  if (isJump) {
    // Knees up — short legs tucked.
    rect(g, bx + 1, legsY, 4, 2, p.bodyShade);
    px(g, bx + 1, legsY + 1, p.body);
    px(g, bx + 4, legsY + 1, p.body);
    return;
  }
  if (isFall) {
    // Legs apart.
    rect(g, bx, legsY, 2, 3, p.bodyShade);
    rect(g, bx + 4, legsY, 2, 3, p.bodyShade);
    px(g, bx, legsY + 2, p.body);
    px(g, bx + 5, legsY + 2, p.body);
    return;
  }
  if (walkFrame >= 0) {
    // Walk cycle — 6-frame stride.
    const phase = walkFrame % 6;
    const leftFwd = phase === 0 || phase === 1 || phase === 5;
    if (leftFwd) {
      rect(g, bx + 1, legsY, 2, 3, p.bodyShade);
      rect(g, bx + 3, legsY, 2, 2, p.bodyShade);
      px(g, bx + 4, legsY + 2, p.body);
    } else {
      rect(g, bx + 1, legsY, 2, 2, p.bodyShade);
      rect(g, bx + 3, legsY, 2, 3, p.bodyShade);
      px(g, bx + 1, legsY + 2, p.body);
    }
    return;
  }
  // Idle — straight legs.
  rect(g, bx + 1, legsY, 1, 3, p.bodyShade);
  rect(g, bx + 4, legsY, 1, 3, p.bodyShade);
  rect(g, bx + 2, legsY, 2, 3, p.body);
};

const paintHead = (
  g: CanvasRenderingContext2D,
  p: ArcherPalette,
  headY: number,
  skin: ArcherSkinId,
): void => {
  // Face — 4×3 centered.
  rect(g, 6, headY, 4, 3, p.skin);
  // Eye — 1 px on the right side (facing right by default; renderer
  // mirrors the texture for facing="L").
  px(g, 8, headY + 1, p.eye);
  // Headwear varies per skin.
  switch (skin) {
    case "verdant":
      // Leaf hood — single tip up + side flares.
      rect(g, 5, headY, 6, 1, p.cape);
      px(g, 7, headY - 1, p.bodyLight);
      px(g, 8, headY - 1, p.cape);
      break;
    case "crimson":
      // Helmet + 3-px vertical plume.
      rect(g, 5, headY - 1, 6, 1, p.bodyShade);
      px(g, 8, headY - 2, p.accent);
      px(g, 8, headY - 3, p.accent);
      px(g, 9, headY - 1, p.accent);
      break;
    case "azure":
      // Pointed hood — 2 px tip.
      rect(g, 5, headY, 6, 1, p.cape);
      px(g, 8, headY - 1, p.cape);
      px(g, 8, headY - 2, p.capeShade);
      // Cyan crystal on forehead.
      px(g, 7, headY + 1, p.accent);
      break;
    case "saffron":
      // Flat-brim hat — wide brim above the head.
      rect(g, 4, headY - 1, 8, 1, p.body);
      rect(g, 5, headY - 2, 6, 1, p.bodyShade);
      px(g, 8, headY - 2, p.accent);
      break;
    case "onyx":
      // Full hood, only mask shows. Replace face with mask colour.
      rect(g, 5, headY - 1, 6, 1, p.cape);
      rect(g, 6, headY, 4, 3, p.skin); // mask (skin colour is mask white)
      px(g, 7, headY + 1, p.eye);
      px(g, 8, headY + 1, p.eye);
      break;
    case "frost":
      // Light hair + diadem — 2 horizontal bright pixels above the eyes.
      rect(g, 5, headY, 6, 1, p.body);
      rect(g, 6, headY - 1, 4, 1, p.bodyLight);
      px(g, 7, headY - 1, p.accent);
      px(g, 8, headY - 1, p.accent);
      break;
  }
};

// Bow rendered at one of 8 directions around the body. The bow itself
// is a 3×1 or 1×3 line + tip arrows.
const paintBow = (
  g: CanvasRenderingContext2D,
  p: ArcherPalette,
  dir: AimDir,
  shootFrame: number,
): void => {
  // Recoil offset — frames 0/1/2 push the bow slightly back.
  const recoil = shootFrame === 0 ? 1 : shootFrame === 1 ? 0 : 0;
  const flash = shootFrame === 1;

  // Body centre roughly at (8, 8). Bow sits 3 px out in `dir`.
  const offsets: Record<AimDir, readonly [number, number]> = {
    E: [3 - recoil, 0],
    W: [-3 + recoil, 0],
    N: [0, -3 + recoil],
    S: [0, 3 - recoil],
    NE: [2 - recoil, -2 + recoil],
    NW: [-2 + recoil, -2 + recoil],
    SE: [2 - recoil, 2 - recoil],
    SW: [-2 + recoil, 2 - recoil],
  };
  const [ox, oy] = offsets[dir];
  const cx = 8 + ox;
  const cy = 8 + oy;

  // Bow itself — small 3-pixel arc oriented perpendicular to the
  // aim direction. We render a simple 3×3 cross instead of a curve
  // (16×16 is too small for an arc).
  px(g, cx, cy, p.bow);
  if (dir === "E" || dir === "W") {
    px(g, cx, cy - 1, p.bow);
    px(g, cx, cy + 1, p.bow);
  } else if (dir === "N" || dir === "S") {
    px(g, cx - 1, cy, p.bow);
    px(g, cx + 1, cy, p.bow);
  } else {
    // Diagonals: cross perpendicular.
    px(g, cx - 1, cy - 1, p.bow);
    px(g, cx + 1, cy + 1, p.bow);
  }
  // Bowstring centre highlight.
  px(g, cx, cy, p.bodyLight);

  if (flash) {
    // Muzzle flash 2×2 white.
    rect(g, cx - 1, cy - 1, 2, 2, "#ffffff");
  }
};

const paintDodgeStreaks = (
  g: CanvasRenderingContext2D,
  p: ArcherPalette,
  frame: number,
): void => {
  // 3 horizontal motion lines behind the body, fade as frame advances.
  const alpha = [0.9, 0.7, 0.45, 0.2][frame] ?? 0.5;
  g.globalAlpha = alpha;
  rect(g, 1, 7, 3, 1, p.bodyLight);
  rect(g, 0, 9, 4, 1, p.bodyLight);
  rect(g, 1, 11, 3, 1, p.bodyLight);
  g.globalAlpha = 1;
};

// Death — 4 fragments scatter outward over 4 frames. Pixel cluster
// centred on body centre, alpha fades.
const paintDeath = (p: ArcherPalette, frame: number): HTMLCanvasElement => {
  const cv = newCanvas(ARCHER_SPRITE_SIZE, ARCHER_SPRITE_SIZE);
  const g = cv.getContext("2d")!;
  const cx = 8;
  const cy = 8;
  const spread = (frame + 1) * 1.5;
  const alpha = 1 - frame * 0.22;
  g.globalAlpha = Math.max(0.1, alpha);
  // 8 fragments around body centre.
  const angles = [0, 1, 2, 3, 4, 5, 6, 7];
  for (const a of angles) {
    const theta = (a / 8) * Math.PI * 2;
    const fx = Math.round(cx + Math.cos(theta) * spread);
    const fy = Math.round(cy + Math.sin(theta) * spread);
    px(g, fx, fy, a % 2 === 0 ? p.body : p.cape);
  }
  // Centre body chunk fades fast.
  if (frame < 2) {
    rect(g, cx - 1, cy - 1, 2, 2, p.bodyShade);
  }
  g.globalAlpha = 1;
  return cv;
};

// Map an 8-direction aim vector (or null) to an AimDir key.
// `aim` is a unit-ish vector from input.aimDirection; null = no aim.
export const aimDirOf = (
  ax: number | null,
  ay: number | null,
  facing: "L" | "R",
): AimDir => {
  if (ax === null || ay === null) {
    return facing === "R" ? "E" : "W";
  }
  // Normalise to ±1 buckets.
  const sx = Math.sign(ax);
  const sy = Math.sign(ay);
  if (sx === 0 && sy < 0) return "N";
  if (sx === 0 && sy > 0) return "S";
  if (sx > 0 && sy === 0) return "E";
  if (sx < 0 && sy === 0) return "W";
  if (sx > 0 && sy < 0) return "NE";
  if (sx > 0 && sy > 0) return "SE";
  if (sx < 0 && sy < 0) return "NW";
  if (sx < 0 && sy > 0) return "SW";
  return facing === "R" ? "E" : "W";
};

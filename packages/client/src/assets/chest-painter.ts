// Phase 10 — Chest sprite. 16×16 px frames.
//   frame 0   = closed (padlocked).
//   frames 1-5 = opening animation (lid lifts, padlock pops, halo).
// The renderer indexes into these via openTimer/CHEST_OPEN_DURATION_FRAMES.

import { newCanvas, px, rect } from "./canvas.js";

export const CHEST_SPRITE_W = 16;
export const CHEST_SPRITE_H = 16;
export const CHEST_FRAME_COUNT = 6;

export type ChestSpriteKey = `chest_${number}`;

export const buildChestSprites = (): Map<ChestSpriteKey, HTMLCanvasElement> => {
  const out = new Map<ChestSpriteKey, HTMLCanvasElement>();
  for (let f = 0; f < CHEST_FRAME_COUNT; f++) {
    out.set(`chest_${f}`, paintChestFrame(f));
  }
  return out;
};

const WOOD_DARK = "#5a3e22";
const WOOD_MID = "#8a5e34";
const WOOD_LIGHT = "#b08050";
const IRON_DARK = "#3a2840";
const IRON_LIGHT = "#7a98b4";
const GOLD = "#fcd757";
const GOLD_LIGHT = "#ffe07a";
const HALO = "#fcd757";

const paintChestFrame = (frame: number): HTMLCanvasElement => {
  const cv = newCanvas(CHEST_SPRITE_W, CHEST_SPRITE_H);
  const g = cv.getContext("2d")!;

  // Common base — chest body sits in cells y=4..15 (12 px tall, leaves
  // room for lid raise above).
  const bodyTop = 7;
  const bodyBot = 15;

  // Body wood.
  rect(g, 1, bodyTop, 14, bodyBot - bodyTop + 1, WOOD_MID);
  rect(g, 1, bodyTop, 14, 1, WOOD_LIGHT);
  rect(g, 1, bodyBot, 14, 1, WOOD_DARK);
  rect(g, 1, bodyTop, 1, bodyBot - bodyTop + 1, WOOD_DARK);
  rect(g, 14, bodyTop, 1, bodyBot - bodyTop + 1, WOOD_DARK);

  // Iron straps left + right + bottom.
  rect(g, 2, bodyTop + 1, 1, bodyBot - bodyTop - 1, IRON_DARK);
  rect(g, 13, bodyTop + 1, 1, bodyBot - bodyTop - 1, IRON_DARK);
  rect(g, 1, bodyBot - 1, 14, 1, IRON_DARK);

  // Lid — its vertical position rises with frame.
  // frame 0 → lid sits flush at lidTop=4.
  // frame 5 → lid lifted by 3 px and tilts.
  const lidLift = Math.min(3, Math.max(0, frame));
  const lidTop = 4 - lidLift;
  const lidBot = 7 - lidLift;

  // Lid surface.
  rect(g, 1, lidTop, 14, lidBot - lidTop + 1, WOOD_LIGHT);
  rect(g, 1, lidTop, 14, 1, GOLD); // top trim
  rect(g, 1, lidBot, 14, 1, WOOD_DARK);
  rect(g, 1, lidTop, 1, lidBot - lidTop + 1, IRON_DARK);
  rect(g, 14, lidTop, 1, lidBot - lidTop + 1, IRON_DARK);

  // Padlock — visible at frame 0..1, pops up + spins out by frame 4.
  if (frame === 0) {
    // Closed padlock centered on the seam.
    rect(g, 6, 6, 4, 3, IRON_DARK);
    px(g, 7, 5, IRON_LIGHT);
    px(g, 8, 5, IRON_LIGHT);
    px(g, 7, 7, GOLD);
    px(g, 8, 7, GOLD);
  } else if (frame === 1) {
    // Padlock cracked, slight glow.
    rect(g, 6, 6, 4, 2, IRON_DARK);
    px(g, 7, 7, GOLD_LIGHT);
    px(g, 8, 7, GOLD_LIGHT);
  } else if (frame === 2) {
    // Padlock falls — small triangle below.
    px(g, 7, 8, IRON_DARK);
    px(g, 8, 8, IRON_DARK);
  }

  // Halo glow during late opening.
  if (frame >= 3) {
    const haloAlpha = frame === 3 ? 0.4 : frame === 4 ? 0.7 : 0.55;
    g.globalAlpha = haloAlpha;
    rect(g, 4, lidTop + 2, 8, 1, HALO);
    rect(g, 5, lidTop + 3, 6, 1, HALO);
    g.globalAlpha = 1.0;
  }

  // Final frame — coin sparkle pop.
  if (frame === 5) {
    px(g, 5, lidTop + 1, GOLD_LIGHT);
    px(g, 8, lidTop, "#ffffff");
    px(g, 11, lidTop + 1, GOLD_LIGHT);
  }

  return cv;
};

// Map an openTimer (0..30 → frames 5..0) to the frame index. The
// CHEST_OPEN_DURATION_FRAMES constant on the engine side is 30.
export const chestFrameFor = (
  status: "closed" | "opening" | "opened",
  openTimer: number,
  duration: number,
): number => {
  if (status === "closed") return 0;
  if (status === "opened") return CHEST_FRAME_COUNT - 1;
  // Opening: t = 0 (just triggered) → frame 0; t = duration → frame 5.
  const t = Math.min(1, Math.max(0, 1 - openTimer / duration));
  return Math.min(CHEST_FRAME_COUNT - 1, Math.floor(t * CHEST_FRAME_COUNT));
};

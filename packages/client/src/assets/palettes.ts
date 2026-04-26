// Phase 10 — Visual style contract palettes. Each theme is 32 colors
// organised into 8 families × 4 ramps (shadow/mid/light/spec). The
// painters reach into these by family name so a palette swap is a
// pure data change. See docs/visual-style.md §2 for the design rationale.
//
// Hex strings are converted to packed 0xRRGGBB ints by the canvas
// utilities at paint time — keeping them as hex here makes the file
// readable side-by-side with the spec doc.

import type { ThemeId } from "@arrowfall/shared";

export type Ramp = readonly [string, string, string, string];

export type ThemePalette = {
  readonly stone: Ramp;
  readonly accent: Ramp; // moss / snow / gold-rune
  readonly wood: Ramp;
  readonly sky: Ramp; // sky / nightSky / void
  readonly metal: Ramp; // gold-trim / banner / cyan-magic
  readonly fire: Ramp; // torch / lava / orange
  readonly text: Ramp; // [darkText, midText, lightText, white]
  readonly transparent: 0;
};

export const PALETTES: Readonly<Record<ThemeId, ThemePalette>> = {
  "sacred-grove": {
    accent: ["#2c5a3a", "#3a7d44", "#5da671", "#88c97a"], // moss
    stone: ["#4a5238", "#7c8a5b", "#a3b078", "#c8d699"],
    wood: ["#4a2f1c", "#7a4a2c", "#a87044", "#d4995c"],
    sky: ["#5fa6c4", "#7ec8e3", "#a6dcec", "#cfeaf5"],
    metal: ["#a0741a", "#d4a02a", "#f1c757", "#fcd757"], // gold accents
    fire: ["#7a2820", "#c84030", "#ff6a3a", "#ff8c39"],
    text: ["#1a2618", "#3c5a40", "#dceadb", "#ffffff"],
    transparent: 0,
  },
  "twin-spires": {
    stone: ["#1a2840", "#243a5e", "#345978", "#5a82a5"], // cold stone
    accent: ["#7a98b4", "#a5bcd0", "#cfdfee", "#e8f1ff"], // snow
    metal: ["#5a181a", "#a02828", "#d04040", "#ec6a5a"], // banner red
    wood: ["#2a1f14", "#5a3e22", "#8a5e34", "#b08050"],
    sky: ["#1c1830", "#2c2748", "#4a3a6a", "#7858a0"], // night sky
    fire: ["#8a5818", "#c4862a", "#f7c84a", "#ffe07a"], // warm gold
    text: ["#0c0e18", "#3a4866", "#dce6f4", "#ffffff"],
    transparent: 0,
  },
  "old-temple": {
    stone: ["#170818", "#3b1d3a", "#5b2e54", "#7a4274"], // purple stone
    metal: ["#6a4818", "#a07a22", "#c89c3a", "#f1c757"], // gold rune
    sky: ["#000000", "#0a0612", "#181024", "#241a36"], // void background
    fire: ["#7a2410", "#c84818", "#ff7a2a", "#ffaa48"], // torch orange
    accent: ["#1a5e54", "#28a292", "#56e1c8", "#9af2da"], // cyan magic
    wood: ["#3a2418", "#664028", "#a06038", "#d08a52"], // bronze
    text: ["#0a0410", "#3a2840", "#e0d0e8", "#ffffff"],
    transparent: 0,
  },
};

// Archer skin palettes — independent of the map theme. 6 fixed colour
// schemes, one per archer slot. Each maps to a small Ramp the
// archer-painter draws into (body / cape / accent / eye).
export type ArcherSkinId =
  | "verdant"
  | "crimson"
  | "azure"
  | "saffron"
  | "onyx"
  | "frost";

export type ArcherPalette = {
  readonly body: string;
  readonly bodyShade: string;
  readonly bodyLight: string;
  readonly cape: string;
  readonly capeShade: string;
  readonly accent: string; // belt / plume / crystal etc.
  readonly skin: string; // face / hands
  readonly eye: string;
  readonly bow: string;
};

export const ARCHER_SKINS: Readonly<Record<ArcherSkinId, ArcherPalette>> = {
  verdant: {
    body: "#3a7d44",
    bodyShade: "#2c5a3a",
    bodyLight: "#5da671",
    cape: "#5da671",
    capeShade: "#3a7d44",
    accent: "#a0741a",
    skin: "#e8c69a",
    eye: "#fcd757",
    bow: "#7a4a2c",
  },
  crimson: {
    body: "#a02828",
    bodyShade: "#5a181a",
    bodyLight: "#d04040",
    cape: "#d04040",
    capeShade: "#a02828",
    accent: "#fcd757",
    skin: "#e8c69a",
    eye: "#ffe07a",
    bow: "#7a4a2c",
  },
  azure: {
    body: "#243a5e",
    bodyShade: "#1a2840",
    bodyLight: "#5a82a5",
    cape: "#5a82a5",
    capeShade: "#243a5e",
    accent: "#56e1c8",
    skin: "#cfdfee",
    eye: "#9af2da",
    bow: "#3a2418",
  },
  saffron: {
    body: "#c4862a",
    bodyShade: "#8a5818",
    bodyLight: "#f7c84a",
    cape: "#5da671",
    capeShade: "#3a7d44",
    accent: "#7a4a2c",
    skin: "#e8c69a",
    eye: "#ffffff",
    bow: "#7a4a2c",
  },
  onyx: {
    body: "#181024",
    bodyShade: "#000000",
    bodyLight: "#3a2840",
    cape: "#3a2840",
    capeShade: "#181024",
    accent: "#dce6f4",
    skin: "#dce6f4", // mask
    eye: "#ec6a5a", // crimson eye through the mask
    bow: "#0a0612",
  },
  frost: {
    body: "#a5bcd0",
    bodyShade: "#5a82a5",
    bodyLight: "#e8f1ff",
    cape: "#cfdfee",
    capeShade: "#a5bcd0",
    accent: "#56e1c8",
    skin: "#e8f1ff",
    eye: "#cfdfee",
    bow: "#5a82a5",
  },
};

export const ALL_ARCHER_SKINS: ReadonlyArray<ArcherSkinId> = [
  "verdant",
  "crimson",
  "azure",
  "saffron",
  "onyx",
  "frost",
];

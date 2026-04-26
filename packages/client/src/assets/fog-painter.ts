// Phase 10.5.a — Volumetric fog overlay. A tileable 256×270 RGBA
// texture per theme, sampled by a TilingSprite that drifts horizontally
// each frame. Low-alpha (0.06–0.10) so it reads as atmosphere rather
// than a wall — gameplay stays fully legible underneath.
//
// We use a small 2-octave value-noise (smoothed lattice) instead of a
// proper Perlin/Simplex implementation. It costs ~70 KB of canvas
// pixels at boot, runs in node-free DOM, and the perceptual difference
// vs Perlin in this use case (drifting cloudy bands) is negligible.
//
// Tileability: the lattice grid wraps modulo grid size on the X axis
// only — we don't need vertical tiling because the fog is a fixed band
// (270 px tall, full playfield height).

import type { ThemeId } from "@arrowfall/shared";
import { newCanvas } from "./canvas.js";
import { PALETTES } from "./palettes.js";

export const FOG_W = 256; // tile width
export const FOG_H = 270; // matches playfield height

export type FogSpriteKey = `fog_${ThemeId}`;

// Pure helper: 2D value noise sample at (x, y) seeded by `seed`. Lattice
// pitch is `cellW` × `cellH` pixels; smoothstep interpolation. Output
// is in [0, 1]. Wraps on X (no wrap on Y — fog band is exactly FOG_H
// tall).
//
// Exposed for tests so we can verify determinism + range without DOM.
export const fogValueAt = (
  x: number,
  y: number,
  cellW: number,
  cellH: number,
  seed: number,
  wrapW: number,
): number => {
  const gx = x / cellW;
  const gy = y / cellH;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const tx = gx - x0;
  const ty = gy - y0;
  // Smoothstep weights — keep value-noise visually soft.
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);

  const lattice = (ix: number, iy: number): number => {
    // Wrap X around `wrapW / cellW` cells so the noise field tiles.
    const cellsX = Math.max(1, Math.floor(wrapW / cellW));
    const wx = ((ix % cellsX) + cellsX) % cellsX;
    let h = seed >>> 0;
    h = Math.imul(h ^ (wx * 374761393), 0x01000193);
    h = Math.imul(h ^ (iy * 668265263), 0x01000193);
    h ^= h >>> 13;
    return ((h >>> 0) % 1000) / 999; // [0, 1]
  };

  const v00 = lattice(x0, y0);
  const v10 = lattice(x0 + 1, y0);
  const v01 = lattice(x0, y0 + 1);
  const v11 = lattice(x0 + 1, y0 + 1);
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sy;
};

export const buildFogSprites = (
  theme: ThemeId,
): Map<FogSpriteKey, HTMLCanvasElement> => {
  const out = new Map<FogSpriteKey, HTMLCanvasElement>();
  out.set(`fog_${theme}`, paintFog(theme));
  return out;
};

const paintFog = (theme: ThemeId): HTMLCanvasElement => {
  const cv = newCanvas(FOG_W, FOG_H);
  const g = cv.getContext("2d")!;
  const p = PALETTES[theme];

  // Theme-specific tint + alpha cap. Sacred = pale green-cream, Spires
  // = pale blue-white, Temple = warm purple-orange ember.
  // We pull from existing palette ramps to stay consistent.
  const [tint, alphaCap] =
    theme === "sacred-grove"
      ? ([p.text[2], 0.10] as const) // pale moss-tinted cream
      : theme === "twin-spires"
        ? ([p.accent[3], 0.12] as const) // bright snow-white
        : ([p.fire[3], 0.09] as const); // warm orange ember

  // 2-octave value-noise — hard-coded seeds per theme so the fog
  // pattern is figé across rebuilds (visual diff continuity).
  const seed =
    theme === "sacred-grove"
      ? 0x5acred
      : theme === "twin-spires"
        ? 0x5917e5
        : 0x7e_0ple;

  // ImageData for direct pixel writes — much faster than 70k fillRects.
  const img = g.createImageData(FOG_W, FOG_H);
  const data = img.data;

  // Parse tint hex once.
  const [tr, tg, tb] = parseHex(tint);

  for (let y = 0; y < FOG_H; y++) {
    for (let x = 0; x < FOG_W; x++) {
      // Octave 1 — 32×48 cells, slow large drift.
      const o1 = fogValueAt(x, y, 32, 48, seed, FOG_W);
      // Octave 2 — 12×16 cells, finer detail.
      const o2 = fogValueAt(x, y, 12, 16, seed ^ 0xbeef, FOG_W);
      // Combine with weights — bias toward big features.
      const v = o1 * 0.7 + o2 * 0.3;
      // Vertical falloff — fog thickest in the middle band, thinning
      // toward top/bottom so the playfield edges don't look gauzy.
      const vy = y / FOG_H;
      const vFalloff = Math.sin(vy * Math.PI); // 0 at top/bottom, 1 mid
      // Threshold: only the top ~50% of noise survives, then ramped.
      const t = Math.max(0, v - 0.45) * 1.8; // [0, ~1]
      const a = Math.min(1, t * vFalloff) * alphaCap * 255;

      const i = (y * FOG_W + x) * 4;
      data[i] = tr;
      data[i + 1] = tg;
      data[i + 2] = tb;
      data[i + 3] = Math.round(a);
    }
  }

  g.putImageData(img, 0, 0);
  return cv;
};

const parseHex = (hex: string): [number, number, number] => {
  // Accept "#rrggbb"; non-hex inputs return black.
  if (hex.length !== 7 || hex[0] !== "#") return [0, 0, 0];
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
};

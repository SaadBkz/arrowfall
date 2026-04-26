// Phase 10.5b — CC0 sprite-sheet loader.
//
// Loads Kenney's Tiny Dungeon (CC0) PNG into an HTMLImageElement, then
// slices it into a Map<key, HTMLCanvasElement> following the standard
// Kenney layout (12 cols × 11 rows of 16×16 tiles, 1 px gap).
//
// We deliberately stay in Canvas-land (not Pixi Texture) so callers
// can apply per-theme / per-skin tints at boot time before the result
// is wrapped in a Pixi Texture. Tinting a Pixi Texture in v8 requires
// going through Sprite.tint at draw-time — that would force every
// renderer to know about theme. Doing it once at boot keeps the
// existing AssetRegistry contract (Texture per logical key).
//
// The sheet path is `/assets/cc0/kenney/tiny-dungeon.png` (served by
// Vite from `packages/client/public/`).

import { ctx2d, newCanvas } from "./canvas.js";

export const TD_TILE_SIZE = 16;
export const TD_TILE_GAP = 1;
export const TD_GRID_COLS = 12;
export const TD_GRID_ROWS = 11;
export const TD_SHEET_URL = "/assets/cc0/kenney/tiny-dungeon.png";

// One canvas per tile, keyed by `td_${row}_${col}`.
export type CC0Sheet = ReadonlyMap<string, HTMLCanvasElement>;

let sheetCache: CC0Sheet | null = null;

export const tdKey = (row: number, col: number): string =>
  `td_${row}_${col}`;

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = (): void => resolve(img);
    img.onerror = (e): void => reject(new Error(`Failed to load ${url}: ${e}`));
    img.src = url;
  });

export const loadCC0Sheet = async (): Promise<CC0Sheet> => {
  if (sheetCache !== null) return sheetCache;

  const img = await loadImage(TD_SHEET_URL);

  const out = new Map<string, HTMLCanvasElement>();
  for (let row = 0; row < TD_GRID_ROWS; row++) {
    for (let col = 0; col < TD_GRID_COLS; col++) {
      const sx = col * (TD_TILE_SIZE + TD_TILE_GAP);
      const sy = row * (TD_TILE_SIZE + TD_TILE_GAP);
      const cv = newCanvas(TD_TILE_SIZE, TD_TILE_SIZE);
      const g = ctx2d(cv);
      g.drawImage(
        img,
        sx,
        sy,
        TD_TILE_SIZE,
        TD_TILE_SIZE,
        0,
        0,
        TD_TILE_SIZE,
        TD_TILE_SIZE,
      );
      out.set(tdKey(row, col), cv);
    }
  }

  sheetCache = out;
  return out;
};

// Convenience: fetch a tile by grid coords or throw if out of bounds.
export const tdAt = (
  sheet: CC0Sheet,
  row: number,
  col: number,
): HTMLCanvasElement => {
  const c = sheet.get(tdKey(row, col));
  if (c === undefined) {
    throw new Error(`tdAt(${row}, ${col}): out of sheet bounds`);
  }
  return c;
};

// Pixel-multiply a tile by an RGB tint. Returns a new canvas; the
// source is untouched so callers can re-tint differently.
//
// `tint` is 0xRRGGBB. Alpha is preserved; 0-alpha pixels are skipped
// (otherwise multiplying transparent pixels by a non-white colour
// would produce ghost edges).
export const tintTile = (
  src: HTMLCanvasElement,
  tint: number,
): HTMLCanvasElement => {
  const out = newCanvas(src.width, src.height);
  const g = ctx2d(out);
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, src.width, src.height);
  const data = img.data;
  const tr = (tint >> 16) & 0xff;
  const tg = (tint >> 8) & 0xff;
  const tb = tint & 0xff;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = (data[i]! * tr) >> 8;
    data[i + 1] = (data[i + 1]! * tg) >> 8;
    data[i + 2] = (data[i + 2]! * tb) >> 8;
  }
  g.putImageData(img, 0, 0);
  return out;
};

// Test-only: clear the module-level cache so a fresh load re-fetches.
export const _resetCC0CacheForTests = (): void => {
  sheetCache = null;
};

// Phase 10.5b — Archer sprite builder backed by Tiny Dungeon (CC0).
//
// Maps every animation key (idle / walk / jump / fall / dodge / aim /
// shoot / death) to the SAME tinted CC0 knight tile. This sacrifices
// per-frame animation (no walk cycle, no shoot recoil) for a much
// higher-fidelity static silhouette — TowerFall archers themselves
// are nearly static at this zoom, so the loss is small.
//
// Each archer slot picks up its colour via a multiplicative tint over
// the base knight (which Kenney shipped in a near-grey palette so the
// tint reads cleanly).
//
// Same return-type as `buildArcherSprites(skin)` so AssetRegistry +
// ArchersRenderer stay unchanged.

import {
  buildArcherSprites as buildArcherSpritesProcedural,
  type ArcherSpriteKey,
} from "./archer-painter.js";
import { tdAt, tintTile, type CC0Sheet } from "./cc0-loader.js";
import { TD_ARCHER_BODY, TD_SKIN_TINT } from "./cc0-mapping.js";
import { newCanvas, ctx2d } from "./canvas.js";
import type { ArcherSkinId } from "./palettes.js";

// Bake one tinted knight tile per skin, then map every archer key to
// the same canvas. The renderer will keyword-cycle between idle_0,
// walk_2, etc. — they all resolve to the same image, so we read as a
// single static character regardless of state.
//
// We render the knight onto a 16×16 canvas at the same offset the
// procedural archer used (the renderer applies ARCHER_SPRITE_OX/OY
// when positioning sprites — keeping the canvas size/format identical
// avoids sprite-anchor surprises).
export const buildArcherSpritesCC0 = (
  skin: ArcherSkinId,
  sheet: CC0Sheet,
): Map<ArcherSpriteKey, HTMLCanvasElement> => {
  // Tint the knight tile.
  const baseKnight = tdAt(sheet, TD_ARCHER_BODY.row, TD_ARCHER_BODY.col);
  const tinted = tintTile(baseKnight, TD_SKIN_TINT[skin]);

  // Render onto a 16×16 canvas (already 16×16 — but use a fresh canvas
  // so the same texture isn't shared across animation frame keys.
  // Pixi v8 can have issues if a single canvas backs many Textures
  // and gets re-uploaded; safer to clone).
  const cloneCanvas = (): HTMLCanvasElement => {
    const cv = newCanvas(16, 16);
    const g = ctx2d(cv);
    g.drawImage(tinted, 0, 0);
    return cv;
  };

  // Pull the procedural map purely to enumerate the key set so we
  // never miss one. Then overwrite every value with our tinted clone.
  const proceduralKeys = buildArcherSpritesProcedural(skin).keys();
  const out = new Map<ArcherSpriteKey, HTMLCanvasElement>();
  for (const key of proceduralKeys) {
    out.set(key, cloneCanvas());
  }
  return out;
};

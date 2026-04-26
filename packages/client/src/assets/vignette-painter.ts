// Phase 10.5.a — Vignette overlay. A single 480×270 RGBA texture
// that's transparent at the centre of the playfield and progressively
// blackens toward the corners. Sits ABOVE everything except HUD /
// round-message so it darkens tilemap, archers, arrows, decorations
// uniformly — gives the "old TV" + "tableau" feel of the TowerFall
// reference shots.
//
// We bake it once at boot rather than computing per-frame, which keeps
// the steady-state cost at a single textured quad.

import { newCanvas } from "./canvas.js";

export const VIGNETTE_W = 480;
export const VIGNETTE_H = 270;

// Tunables — exposed so the render layer can also drive the alpha if
// we ever want a punch-in effect (not used in 10.5.a).
export const VIGNETTE_INNER_RADIUS_FRACT = 0.45; // 0..1 of half-diagonal
export const VIGNETTE_OUTER_RADIUS_FRACT = 1.0;
// Phase 10.5b — toned 0.55 → 0.32 to keep the corners darker than
// the centre without the previous "everything muddy" feel.
export const VIGNETTE_MAX_ALPHA = 0.32;

// Pure helper: returns the alpha (0..1) at logical pixel (x, y) for a
// canvas of size (w, h). Exposed for tests so we can verify the
// gradient profile without instantiating a DOM canvas.
export const vignetteAlphaAt = (
  x: number,
  y: number,
  w: number,
  h: number,
): number => {
  const cx = w / 2;
  const cy = h / 2;
  const dx = x - cx;
  const dy = y - cy;
  // Aspect-correct distance in [0, 1]: 0 at centre, 1 at the farthest
  // corner. Using max(w, h) as the normaliser keeps the gradient
  // circular in pixel space (a rectangular vignette would crush the
  // top/bottom on a 16:9 frame).
  const halfDiag = Math.sqrt(cx * cx + cy * cy);
  const dist = Math.sqrt(dx * dx + dy * dy) / halfDiag;
  if (dist <= VIGNETTE_INNER_RADIUS_FRACT) return 0;
  if (dist >= VIGNETTE_OUTER_RADIUS_FRACT) return VIGNETTE_MAX_ALPHA;
  const t =
    (dist - VIGNETTE_INNER_RADIUS_FRACT) /
    (VIGNETTE_OUTER_RADIUS_FRACT - VIGNETTE_INNER_RADIUS_FRACT);
  // Smoothstep — the corners darken fast but the inner ring stays soft.
  const eased = t * t * (3 - 2 * t);
  return eased * VIGNETTE_MAX_ALPHA;
};

export const buildVignette = (): HTMLCanvasElement => {
  const cv = newCanvas(VIGNETTE_W, VIGNETTE_H);
  const g = cv.getContext("2d")!;

  // Use Canvas's radial gradient — much faster than a per-pixel JS
  // loop and produces an identical curve (we mirror the smoothstep in
  // the gradient stops). The browser implementation downsamples to
  // 8-bit RGBA at the end, same as our per-pixel path would.
  const cx = VIGNETTE_W / 2;
  const cy = VIGNETTE_H / 2;
  const halfDiag = Math.sqrt(cx * cx + cy * cy);
  const innerR = halfDiag * VIGNETTE_INNER_RADIUS_FRACT;
  const outerR = halfDiag * VIGNETTE_OUTER_RADIUS_FRACT;

  const grad = g.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  // Mirror smoothstep at quarter points so the curve matches
  // vignetteAlphaAt() within a few percent.
  grad.addColorStop(0.25, `rgba(0,0,0,${(VIGNETTE_MAX_ALPHA * 0.156).toFixed(3)})`);
  grad.addColorStop(0.5, `rgba(0,0,0,${(VIGNETTE_MAX_ALPHA * 0.5).toFixed(3)})`);
  grad.addColorStop(0.75, `rgba(0,0,0,${(VIGNETTE_MAX_ALPHA * 0.844).toFixed(3)})`);
  grad.addColorStop(1, `rgba(0,0,0,${VIGNETTE_MAX_ALPHA.toFixed(3)})`);

  g.fillStyle = grad;
  g.fillRect(0, 0, VIGNETTE_W, VIGNETTE_H);

  return cv;
};

// Phase 10.5.a — pure-helper tests for the new frame / vignette / fog
// painters. The canvas-painting functions themselves require a DOM and
// are exercised at runtime by buildAllAssets() in the browser; these
// tests cover the deterministic sampling helpers + exposed constants.

import { describe, expect, it } from "vitest";
import { fogValueAt, FOG_W, FOG_H } from "./fog-painter.js";
import { FRAME_PANEL_H, FRAME_PANEL_W } from "./frame-painter.js";
import {
  vignetteAlphaAt,
  VIGNETTE_H,
  VIGNETTE_MAX_ALPHA,
  VIGNETTE_W,
} from "./vignette-painter.js";

describe("frame-painter constants", () => {
  it("exposes 32×270 dimensions matching the viewport gutter", () => {
    expect(FRAME_PANEL_W).toBe(32);
    expect(FRAME_PANEL_H).toBe(270);
  });
});

describe("vignette", () => {
  it("exposes 480×270 dimensions matching the playfield", () => {
    expect(VIGNETTE_W).toBe(480);
    expect(VIGNETTE_H).toBe(270);
  });

  it("alpha is 0 at the centre", () => {
    const a = vignetteAlphaAt(VIGNETTE_W / 2, VIGNETTE_H / 2, VIGNETTE_W, VIGNETTE_H);
    expect(a).toBe(0);
  });

  it("alpha approaches MAX at the corners", () => {
    const corner = vignetteAlphaAt(0, 0, VIGNETTE_W, VIGNETTE_H);
    // Corner sits at the outer-radius (1.0 of half-diag) so it should
    // hit the cap exactly.
    expect(corner).toBeGreaterThanOrEqual(VIGNETTE_MAX_ALPHA - 0.001);
    expect(corner).toBeLessThanOrEqual(VIGNETTE_MAX_ALPHA + 0.001);
  });

  it("alpha increases monotonically from centre to corner", () => {
    const samples = [
      vignetteAlphaAt(VIGNETTE_W / 2, VIGNETTE_H / 2, VIGNETTE_W, VIGNETTE_H),
      vignetteAlphaAt(VIGNETTE_W * 0.4, VIGNETTE_H * 0.4, VIGNETTE_W, VIGNETTE_H),
      vignetteAlphaAt(VIGNETTE_W * 0.25, VIGNETTE_H * 0.25, VIGNETTE_W, VIGNETTE_H),
      vignetteAlphaAt(VIGNETTE_W * 0.1, VIGNETTE_H * 0.1, VIGNETTE_W, VIGNETTE_H),
      vignetteAlphaAt(0, 0, VIGNETTE_W, VIGNETTE_H),
    ];
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!);
    }
  });

  it("alpha is symmetric across the centre", () => {
    const a = vignetteAlphaAt(50, 50, VIGNETTE_W, VIGNETTE_H);
    const b = vignetteAlphaAt(VIGNETTE_W - 50, VIGNETTE_H - 50, VIGNETTE_W, VIGNETTE_H);
    expect(a).toBeCloseTo(b, 5);
  });
});

describe("fog", () => {
  it("exposes 256×270 tileable dimensions", () => {
    expect(FOG_W).toBe(256);
    expect(FOG_H).toBe(270);
  });

  it("returns deterministic samples for the same coords", () => {
    const a = fogValueAt(123, 45, 32, 48, 0xdead, FOG_W);
    const b = fogValueAt(123, 45, 32, 48, 0xdead, FOG_W);
    expect(a).toBe(b);
  });

  it("yields values in [0, 1]", () => {
    for (let y = 0; y < FOG_H; y += 17) {
      for (let x = 0; x < FOG_W; x += 13) {
        const v = fogValueAt(x, y, 32, 48, 0xbeef, FOG_W);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it("is X-tileable: sampling at x and x+wrapW yields the same value", () => {
    // Cell-aligned sampling: when both x and x+wrapW land on the same
    // fractional cell offset, the lattice wrap should make them equal.
    for (let y = 0; y < 100; y += 23) {
      const a = fogValueAt(40, y, 32, 48, 0xc0fee, FOG_W);
      const b = fogValueAt(40 + FOG_W, y, 32, 48, 0xc0fee, FOG_W);
      expect(a).toBeCloseTo(b, 5);
    }
  });

  it("differs across seeds", () => {
    const a = fogValueAt(64, 64, 32, 48, 0x1111, FOG_W);
    const b = fogValueAt(64, 64, 32, 48, 0x2222, FOG_W);
    expect(a).not.toBe(b);
  });
});

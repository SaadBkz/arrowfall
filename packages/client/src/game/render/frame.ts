import { Container, Sprite } from "pixi.js";
import type { ThemeId } from "@arrowfall/shared";
import {
  type AssetRegistry,
  FRAME_PANEL_H,
  FRAME_PANEL_W,
} from "../../assets/index.js";

// Phase 10.5.a — Decorative side-panel frames. Two Sprites positioned
// outside the 480×270 playfield (the canvas is bumped to 544×270 by
// main.ts; the playfield container is offset to x=32).
//
// Z: this renderer attaches at the very bottom of the root stage so
// the playfield container sits on top of it. The frames don't overlap
// gameplay — they live in the 32-px gutter on each side.
//
// Fallback (assets === null): no-op. The 32-px gutters render as the
// canvas background colour, matching the Phase 4 look.
export class FrameRenderer {
  readonly view: Container;
  private readonly assets: AssetRegistry | null;
  private left: Sprite | null = null;
  private right: Sprite | null = null;
  private currentTheme: ThemeId | null = null;
  private readonly playfieldWidth: number;

  // playfieldWidth = the inner ARENA width (480). The right panel is
  // anchored at x = playfieldWidth + FRAME_PANEL_W ; the left panel is
  // at x = -FRAME_PANEL_W . Renderer is added INSIDE the root container
  // alongside the playfield (which itself is offset by FRAME_PANEL_W).
  // We position the panels in *playfield-relative* coordinates so the
  // Game can attach this renderer either inside or outside the playfield
  // container — currently it's added at the canvas root.
  constructor(assets: AssetRegistry | null, playfieldWidth: number) {
    this.assets = assets;
    this.playfieldWidth = playfieldWidth;
    this.view = new Container();
  }

  setTheme(theme: ThemeId): void {
    if (this.assets === null) return;
    if (this.currentTheme === theme) return;
    this.currentTheme = theme;
    const themeFrames = this.assets.frames.get(theme);
    if (themeFrames === undefined) return;
    const leftTex = themeFrames.get(`frame_${theme}_left`);
    const rightTex = themeFrames.get(`frame_${theme}_right`);
    if (leftTex === undefined || rightTex === undefined) return;

    if (this.left === null) {
      this.left = new Sprite(leftTex);
      // Canvas-root coordinates: left panel sits at x=0 (the very edge).
      this.left.x = 0;
      this.left.y = 0;
      this.view.addChild(this.left);
    } else {
      this.left.texture = leftTex;
    }

    if (this.right === null) {
      this.right = new Sprite(rightTex);
      // Right panel: just past the playfield. Canvas root coords =
      // FRAME_PANEL_W (left frame) + playfieldWidth.
      this.right.x = FRAME_PANEL_W + this.playfieldWidth;
      this.right.y = 0;
      this.view.addChild(this.right);
    } else {
      this.right.texture = rightTex;
    }

    void FRAME_PANEL_H;
  }

  dispose(): void {
    if (this.left !== null) this.left.destroy();
    if (this.right !== null) this.right.destroy();
    this.view.destroy();
  }
}

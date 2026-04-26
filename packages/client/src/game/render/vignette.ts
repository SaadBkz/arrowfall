import { Container, Sprite } from "pixi.js";
import {
  type AssetRegistry,
  VIGNETTE_H,
  VIGNETTE_W,
} from "../../assets/index.js";

// Phase 10.5.a — Vignette overlay. A single Sprite covering the
// playfield (480×270), placed near the top of the playfield container's
// z-order so it darkens tilemap + decorations + archers + arrows
// uniformly. HUD and round-message render OVER it (we want them to
// stay legible at all times).
//
// Fallback (assets === null): no-op.
export class VignetteRenderer {
  readonly view: Container;
  private readonly sprite: Sprite | null;

  constructor(assets: AssetRegistry | null) {
    this.view = new Container();
    if (assets === null) {
      this.sprite = null;
      return;
    }
    this.sprite = new Sprite(assets.vignette);
    this.sprite.x = 0;
    this.sprite.y = 0;
    this.sprite.width = VIGNETTE_W;
    this.sprite.height = VIGNETTE_H;
    this.view.addChild(this.sprite);
  }

  dispose(): void {
    if (this.sprite !== null) this.sprite.destroy();
    this.view.destroy();
  }
}

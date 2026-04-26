import type { ThemeId } from "@arrowfall/shared";
import { Container, Graphics, TilingSprite } from "pixi.js";
import { BG_COLOR } from "../colors.js";
import { type AssetRegistry, BG_W, BG_H } from "../../assets/index.js";

// Phase 10 — 2-layer parallax background. Back layer drifts very
// slowly (0.4× tick speed) for cosmic feel; mid layer drifts a bit
// more (0.7×) so silhouettes pull past the back. Using TilingSprite
// keeps the seam invisible without us caring about the world wrap.
//
// Fallback path (assets === null) — solid BG_COLOR Graphics rect, the
// Phase 4 look.
export class BackgroundRenderer {
  readonly view: Container;
  private readonly fallback: Graphics;
  private readonly assets: AssetRegistry | null;
  private back: TilingSprite | null = null;
  private mid: TilingSprite | null = null;
  private currentTheme: ThemeId | null = null;

  constructor(assets: AssetRegistry | null) {
    this.view = new Container();
    this.fallback = new Graphics();
    this.assets = assets;
    this.view.addChild(this.fallback);
    this.bakeFallback();
  }

  setTheme(theme: ThemeId): void {
    if (this.assets === null) return;
    if (this.currentTheme === theme) return;
    this.currentTheme = theme;
    const backTex = this.assets.backgrounds.get(`bg_${theme}_back`);
    const midTex = this.assets.backgrounds.get(`bg_${theme}_mid`);
    if (backTex === undefined || midTex === undefined) return;

    if (this.back === null) {
      this.back = new TilingSprite({
        texture: backTex,
        width: BG_W,
        height: BG_H,
      });
      this.view.addChild(this.back);
    } else {
      this.back.texture = backTex;
    }
    if (this.mid === null) {
      this.mid = new TilingSprite({
        texture: midTex,
        width: BG_W,
        height: BG_H,
      });
      this.view.addChild(this.mid);
    } else {
      this.mid.texture = midTex;
    }
    this.fallback.visible = false;
  }

  // Called every render frame. `tick` is the engine tick (or render
  // frame fallback if the engine isn't authoritative — both work, the
  // motion is purely cosmetic).
  update(tick: number): void {
    if (this.back !== null) {
      this.back.tilePosition.x = Math.floor(-tick * 0.4);
    }
    if (this.mid !== null) {
      this.mid.tilePosition.x = Math.floor(-tick * 0.7);
    }
  }

  private bakeFallback(): void {
    this.fallback.clear();
    this.fallback.rect(0, 0, BG_W, BG_H).fill(BG_COLOR);
  }

  dispose(): void {
    if (this.back !== null) this.back.destroy();
    if (this.mid !== null) this.mid.destroy();
    this.fallback.destroy();
    this.view.destroy();
  }
}

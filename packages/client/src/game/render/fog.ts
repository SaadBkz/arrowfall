import { Container, TilingSprite } from "pixi.js";
import type { ThemeId } from "@arrowfall/shared";
import { ARENA_HEIGHT_PX, ARENA_WIDTH_PX } from "@arrowfall/shared";
import { type AssetRegistry } from "../../assets/index.js";

// Phase 10.5.a — Drifting volumetric fog. A single TilingSprite over
// the playfield (480×270) with a tileable noise texture (256×270). It
// drifts horizontally at a slow rate proportional to the engine tick,
// giving the playfield a sense of moving air without distracting the
// player.
//
// Theme is settable so the M-key cycler swaps the texture.
//
// Fallback (assets === null): no-op.
const FOG_DRIFT_RATE = 0.18; // px per tick — slow, ambient

export class FogRenderer {
  readonly view: Container;
  private readonly assets: AssetRegistry | null;
  private sprite: TilingSprite | null = null;
  private currentTheme: ThemeId | null = null;

  constructor(assets: AssetRegistry | null) {
    this.view = new Container();
    this.assets = assets;
  }

  setTheme(theme: ThemeId): void {
    if (this.assets === null) return;
    if (this.currentTheme === theme) return;
    this.currentTheme = theme;
    const tex = this.assets.fog.get(`fog_${theme}`);
    if (tex === undefined) return;

    if (this.sprite === null) {
      this.sprite = new TilingSprite({
        texture: tex,
        width: ARENA_WIDTH_PX,
        height: ARENA_HEIGHT_PX,
      });
      this.view.addChild(this.sprite);
    } else {
      this.sprite.texture = tex;
    }
  }

  // Called every render frame with the engine tick. Drift is purely
  // cosmetic — even if we're networked and the tick has hiccups, the
  // fog smooths over visually.
  update(tick: number): void {
    if (this.sprite === null) return;
    this.sprite.tilePosition.x = Math.floor(-tick * FOG_DRIFT_RATE);
  }

  dispose(): void {
    if (this.sprite !== null) this.sprite.destroy();
    this.view.destroy();
  }
}

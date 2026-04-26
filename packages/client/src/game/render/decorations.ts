import { Container, Sprite } from "pixi.js";
import type { MapData } from "@arrowfall/shared";
import {
  spawnDecorations,
  type Decoration,
} from "../../assets/decoration-spawner.js";
import type { AssetRegistry } from "../../assets/index.js";

// Phase 10 iter-2 — DecorationsRenderer. Owns a back layer (drawn
// under the tilemap) and a front layer (drawn over). The Game
// inserts these at the correct z-positions so the same renderer
// drives both contexts via setMap().
//
// Decorations are static for the lifetime of the map (no anim today).
// setMap() rebuilds the sprite tree; cycleThemedMap calls it.
export class DecorationsRenderer {
  readonly back: Container;
  readonly front: Container;
  private readonly assets: AssetRegistry | null;

  constructor(assets: AssetRegistry | null) {
    this.back = new Container();
    this.front = new Container();
    this.assets = assets;
  }

  setMap(map: MapData): void {
    this.back.removeChildren();
    this.front.removeChildren();
    if (this.assets === null) return;
    const themeDecos = this.assets.decorations.get(map.theme);
    if (themeDecos === undefined) return;
    const decos = spawnDecorations(map);
    for (const d of decos) {
      const tex = themeDecos.get(d.kind);
      if (tex === undefined) continue;
      const s = new Sprite(tex);
      s.x = Math.floor(d.pos.x);
      s.y = Math.floor(d.pos.y);
      const layer = d.behindTilemap === true ? this.back : this.front;
      layer.addChild(s);
    }
  }

  dispose(): void {
    this.back.destroy({ children: true });
    this.front.destroy({ children: true });
  }
}

// Re-exported for tests / debugging.
export type { Decoration };

import { CHEST_W, CHEST_H, type Chest } from "@arrowfall/engine";
import { CHEST_OPEN_DURATION_FRAMES } from "@arrowfall/shared";
import { Container, Graphics, Sprite } from "pixi.js";
import {
  CHEST_CLOSED_COLOR,
  CHEST_OPENING_COLOR,
  CHEST_OUTLINE_COLOR,
} from "../colors.js";
import {
  type AssetRegistry,
  CHEST_FRAME_COUNT,
  chestFrameFor,
} from "../../assets/index.js";

// Phase 10 — chest renderer with sprite frames. Pool sprites by chest
// id (chests are created server-side and removed when opened — pool
// stays small). The visual cycles through frames 0..5 as openTimer
// counts down from CHEST_OPEN_DURATION_FRAMES → 0.
//
// Fallback path = Phase 9a Graphics (kept for VITE_NO_SPRITES=1).
export class ChestsRenderer {
  readonly view: Container;
  private readonly graphics: Graphics;
  private readonly sprites: Container;
  private readonly assets: AssetRegistry | null;
  private readonly pool = new Map<string, Sprite>();

  constructor(assets: AssetRegistry | null) {
    this.view = new Container();
    this.graphics = new Graphics();
    this.sprites = new Container();
    this.view.addChild(this.graphics);
    this.view.addChild(this.sprites);
    this.assets = assets;
  }

  render(chests: ReadonlyArray<Chest>): void {
    if (this.assets !== null) {
      this.renderSprites(chests, this.assets);
    } else {
      this.renderFallback(chests);
    }
  }

  private renderSprites(
    chests: ReadonlyArray<Chest>,
    assets: AssetRegistry,
  ): void {
    // Hide all pooled sprites first.
    for (const s of this.pool.values()) s.visible = false;

    for (const chest of chests) {
      if (chest.status === "opened") continue;
      const frame = chestFrameFor(
        chest.status,
        chest.openTimer,
        CHEST_OPEN_DURATION_FRAMES,
      );
      const tex = assets.chests.get(`chest_${frame}`);
      if (tex === undefined) continue;
      let s = this.pool.get(chest.id);
      if (s === undefined) {
        s = new Sprite();
        this.sprites.addChild(s);
        this.pool.set(chest.id, s);
      }
      s.texture = tex;
      s.x = chest.pos.x;
      s.y = chest.pos.y;
      s.visible = true;
    }

    // Cull sprites for chests that have disappeared.
    const liveIds = new Set(chests.map((c) => c.id));
    for (const [id, sprite] of this.pool) {
      if (!liveIds.has(id)) {
        sprite.destroy();
        this.pool.delete(id);
      }
    }

    void CHEST_FRAME_COUNT;
  }

  private renderFallback(chests: ReadonlyArray<Chest>): void {
    const g = this.graphics;
    g.clear();
    for (const chest of chests) {
      if (chest.status === "opened") continue;
      const isOpening = chest.status === "opening";
      const t = isOpening ? 1 - chest.openTimer / CHEST_OPEN_DURATION_FRAMES : 0;
      const color = lerpColor(CHEST_CLOSED_COLOR, CHEST_OPENING_COLOR, t);
      const pad = 1;
      g.rect(
        chest.pos.x + pad,
        chest.pos.y + pad,
        CHEST_W - pad * 2,
        CHEST_H - pad * 2,
      )
        .fill(color)
        .stroke({ color: CHEST_OUTLINE_COLOR, width: 1 });
      g.rect(
        chest.pos.x + pad,
        chest.pos.y + pad + 4,
        CHEST_W - pad * 2,
        1,
      ).fill(CHEST_OUTLINE_COLOR);
    }
  }

  dispose(): void {
    for (const s of this.pool.values()) s.destroy();
    this.pool.clear();
    this.graphics.destroy();
    this.sprites.destroy({ children: true });
    this.view.destroy();
  }
}

const lerpColor = (a: number, b: number, t: number): number => {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const tt = Math.max(0, Math.min(1, t));
  const r = Math.round(ar + (br - ar) * tt);
  const g = Math.round(ag + (bg - ag) * tt);
  const bl = Math.round(ab + (bb - ab) * tt);
  return (r << 16) | (g << 8) | bl;
};

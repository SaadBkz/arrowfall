import { type Arrow, type ArrowType, ARROW_H, ARROW_W } from "@arrowfall/engine";
import { Container, Graphics, Sprite } from "pixi.js";
import {
  ARROW_FLYING_COLOR,
  ARROW_GROUNDED_COLOR,
  BOMB_FLYING_COLOR,
  BOMB_GROUNDED_COLOR,
  DRILL_FLYING_COLOR,
  DRILL_GROUNDED_COLOR,
  LASER_FLYING_COLOR,
  LASER_GROUNDED_COLOR,
} from "../colors.js";
import {
  ARROW_SPRITE_OX,
  ARROW_SPRITE_OY,
  ARROW_SPRITE_W,
  ARROW_SPRITE_H,
  type AssetRegistry,
  flyingFrameFor,
} from "../../assets/index.js";

const FLYING_COLOR_BY_TYPE: Readonly<Record<ArrowType, number>> = {
  normal: ARROW_FLYING_COLOR,
  bomb: BOMB_FLYING_COLOR,
  drill: DRILL_FLYING_COLOR,
  laser: LASER_FLYING_COLOR,
};

const GROUNDED_COLOR_BY_TYPE: Readonly<Record<ArrowType, number>> = {
  normal: ARROW_GROUNDED_COLOR,
  bomb: BOMB_GROUNDED_COLOR,
  drill: DRILL_GROUNDED_COLOR,
  laser: LASER_GROUNDED_COLOR,
};

// Renderer with Sprite pool. Arrows can come and go — we re-use sprite
// instances by index in the pool (Pixi creates and destroys are cheap
// but pooling keeps the code straightforward).
//
// Sprite path (assets ≠ null) — texture lookup by `${type}_${flying|grounded}_${frame}`.
// Sprite is rotated to match velocity for flying arrows; grounded uses
// orientation 0 (matches Phase 9b — we don't track landing angle).
//
// Fallback path (assets === null) — Phase 9b Graphics polys.
export class ArrowsRenderer {
  readonly view: Container;
  private readonly graphics: Graphics; // fallback
  private readonly sprites: Container;
  private readonly assets: AssetRegistry | null;
  private readonly pool: Sprite[] = [];

  constructor(assets: AssetRegistry | null) {
    this.view = new Container();
    this.graphics = new Graphics();
    this.sprites = new Container();
    this.view.addChild(this.graphics);
    this.view.addChild(this.sprites);
    this.assets = assets;
  }

  render(arrows: ReadonlyArray<Arrow>): void {
    if (this.assets !== null) {
      this.renderSprites(arrows, this.assets);
    } else {
      this.renderFallback(arrows);
    }
  }

  private renderSprites(
    arrows: ReadonlyArray<Arrow>,
    assets: AssetRegistry,
  ): void {
    // Grow pool as needed.
    while (this.pool.length < arrows.length) {
      const s = new Sprite();
      s.anchor.set(0.5, 0.5);
      this.sprites.addChild(s);
      this.pool.push(s);
    }
    // Hide overflow sprites.
    for (let i = arrows.length; i < this.pool.length; i++) {
      this.pool[i]!.visible = false;
    }

    for (let i = 0; i < arrows.length; i++) {
      const a = arrows[i]!;
      const sprite = this.pool[i]!;
      const flying = a.status === "flying";
      const key = flying
        ? flyingFrameFor(a.type, a.age)
        : (`${a.type}_grounded` as const);
      const tex = assets.arrows.get(key);
      if (tex === undefined) {
        sprite.visible = false;
        continue;
      }
      sprite.texture = tex;
      sprite.visible = true;

      // Centre the sprite at the arrow centre. ARROW_SPRITE_W/H are
      // 12×4; the arrow collider is 8×2. We position by collider centre
      // so the rotation pivot stays consistent.
      const cx = a.pos.x + ARROW_W / 2;
      const cy = a.pos.y + ARROW_H / 2;
      sprite.x = cx;
      sprite.y = cy;
      sprite.rotation = flying ? Math.atan2(a.vel.y, a.vel.x) : 0;

      // Scale 1 — sprite is already at logical pixel resolution. The
      // sprite extends ±2 px past the collider; that's intentional
      // (silhouette > collider, see arrow-painter §sprite OX/OY).
      void ARROW_SPRITE_OX;
      void ARROW_SPRITE_OY;
      void ARROW_SPRITE_W;
      void ARROW_SPRITE_H;
    }
  }

  private renderFallback(arrows: ReadonlyArray<Arrow>): void {
    const g = this.graphics;
    g.clear();
    for (const arrow of arrows) {
      const flying = arrow.status === "flying";
      const palette = flying ? FLYING_COLOR_BY_TYPE : GROUNDED_COLOR_BY_TYPE;
      const color = palette[arrow.type] ?? ARROW_FLYING_COLOR;
      if (flying) {
        const cx = arrow.pos.x + ARROW_W / 2;
        const cy = arrow.pos.y + ARROW_H / 2;
        const angle = Math.atan2(arrow.vel.y, arrow.vel.x);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const hw = ARROW_W / 2;
        const hh = ARROW_H / 2;
        const corners: ReadonlyArray<readonly [number, number]> = [
          [-hw, -hh],
          [hw, -hh],
          [hw, hh],
          [-hw, hh],
        ];
        const flat: number[] = [];
        for (const [lx, ly] of corners) {
          flat.push(cx + lx * cos - ly * sin, cy + lx * sin + ly * cos);
        }
        if (arrow.type === "laser") {
          const haloFlat: number[] = [];
          const inflate = 1.5;
          const hwH = hw + inflate;
          const hhH = hh + inflate;
          const haloCorners: ReadonlyArray<readonly [number, number]> = [
            [-hwH, -hhH],
            [hwH, -hhH],
            [hwH, hhH],
            [-hwH, hhH],
          ];
          for (const [lx, ly] of haloCorners) {
            haloFlat.push(cx + lx * cos - ly * sin, cy + lx * sin + ly * cos);
          }
          g.poly(haloFlat).fill({ color, alpha: 0.35 });
        }
        g.poly(flat).fill(color);
      } else {
        g.rect(arrow.pos.x, arrow.pos.y, ARROW_W, ARROW_H).fill(color);
      }
    }
  }

  dispose(): void {
    for (const s of this.pool) s.destroy();
    this.pool.length = 0;
    this.graphics.destroy();
    this.sprites.destroy({ children: true });
    this.view.destroy();
  }
}

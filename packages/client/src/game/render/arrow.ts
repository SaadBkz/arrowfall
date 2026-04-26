import { type Arrow, type ArrowType, ARROW_H, ARROW_W } from "@arrowfall/engine";
import { Container, Graphics } from "pixi.js";
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

// Stateless renderer: clear + redraw every frame. Flying arrows are
// rotated to match their velocity vector; grounded/embedded ones render
// flat (we don't track their landing angle — keeps the renderer
// zero-state). Phase 9b: drill = orange, laser = white-with-halo.
export class ArrowsRenderer {
  readonly view: Container;
  private readonly graphics: Graphics;

  constructor() {
    this.view = new Container();
    this.graphics = new Graphics();
    this.view.addChild(this.graphics);
  }

  render(arrows: ReadonlyArray<Arrow>): void {
    const g = this.graphics;
    g.clear();

    for (const arrow of arrows) {
      // Status "exploding" lives for at most one engine tick before
      // stepWorld removes the arrow; we still draw it (flat at the
      // resolved position) so the renderer doesn't briefly miss a
      // frame between the impact and the explosion FX.
      const flying = arrow.status === "flying";
      const palette = flying ? FLYING_COLOR_BY_TYPE : GROUNDED_COLOR_BY_TYPE;
      const color = palette[arrow.type] ?? ARROW_FLYING_COLOR;

      if (flying) {
        // Rotate the 8×2 rect around its centre so it tracks velocity.
        // PixiJS Graphics doesn't support per-shape transforms, so we
        // compute the four rotated corners manually and draw a poly.
        const cx = arrow.pos.x + ARROW_W / 2;
        const cy = arrow.pos.y + ARROW_H / 2;
        const angle = Math.atan2(arrow.vel.y, arrow.vel.x);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const hw = ARROW_W / 2;
        const hh = ARROW_H / 2;
        // Local corner offsets, CW from top-left.
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
        // Laser halo: draw a slightly larger, low-alpha poly underneath
        // so the projectile reads "energy beam" rather than "stick".
        if (arrow.type === "laser") {
          const haloFlat: number[] = [];
          // Inflate by 1 px on each axis for the halo body.
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
        // Grounded / embedded — flat horizontal rect at top-left pos.
        g.rect(arrow.pos.x, arrow.pos.y, ARROW_W, ARROW_H).fill(color);
      }
    }
  }

  dispose(): void {
    this.graphics.destroy();
    this.view.destroy();
  }
}

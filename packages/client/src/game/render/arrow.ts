import { type Arrow, ARROW_H, ARROW_W } from "@arrowfall/engine";
import { Container, Graphics } from "pixi.js";
import {
  ARROW_FLYING_COLOR,
  ARROW_GROUNDED_COLOR,
  BOMB_FLYING_COLOR,
  BOMB_GROUNDED_COLOR,
} from "../colors.js";

// Stateless renderer: clear + redraw every frame. Flying arrows are
// rotated to match their velocity vector; grounded/embedded ones render
// flat (we don't track their landing angle — keeps the renderer
// zero-state). Phase 9a: bombs use a red palette so a quick glance
// distinguishes them from white normal arrows mid-flight.
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
      const isBomb = arrow.type === "bomb";
      const color = flying
        ? isBomb
          ? BOMB_FLYING_COLOR
          : ARROW_FLYING_COLOR
        : isBomb
          ? BOMB_GROUNDED_COLOR
          : ARROW_GROUNDED_COLOR;

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

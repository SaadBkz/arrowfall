import { CHEST_W, CHEST_H, type Chest } from "@arrowfall/engine";
import { CHEST_OPEN_DURATION_FRAMES } from "@arrowfall/shared";
import { Container, Graphics } from "pixi.js";
import {
  CHEST_CLOSED_COLOR,
  CHEST_OPENING_COLOR,
  CHEST_OUTLINE_COLOR,
} from "../colors.js";

// Phase 9a — chest renderer. Stateless: clear + redraw every frame.
//
// Visual states:
//   closed   — warm gold square with darker outline.
//   opening  — flashes brighter as the timer counts down (linear
//              brightness ramp tied to openTimer/CHEST_OPEN_DURATION).
//   opened   — never rendered (engine removes it the same frame
//              delivery happens, so we'd never receive this state).
export class ChestsRenderer {
  readonly view: Container;
  private readonly graphics: Graphics;

  constructor() {
    this.view = new Container();
    this.graphics = new Graphics();
    this.view.addChild(this.graphics);
  }

  render(chests: ReadonlyArray<Chest>): void {
    const g = this.graphics;
    g.clear();

    for (const chest of chests) {
      if (chest.status === "opened") continue;
      const isOpening = chest.status === "opening";
      // Brightness ramp: at openTimer = duration, fully closed colour;
      // at openTimer = 0, full opening colour. linear lerp.
      const t = isOpening
        ? 1 - chest.openTimer / CHEST_OPEN_DURATION_FRAMES
        : 0;
      const color = lerpColor(CHEST_CLOSED_COLOR, CHEST_OPENING_COLOR, t);

      const pad = 1; // 1px outline inset so the body sits inside the tile
      g.rect(
        chest.pos.x + pad,
        chest.pos.y + pad,
        CHEST_W - pad * 2,
        CHEST_H - pad * 2,
      )
        .fill(color)
        .stroke({ color: CHEST_OUTLINE_COLOR, width: 1 });

      // Lid hinge — a thin darker bar across the top third makes the
      // chest read as "container with lid" without needing an asset.
      g.rect(
        chest.pos.x + pad,
        chest.pos.y + pad + 4,
        CHEST_W - pad * 2,
        1,
      ).fill(CHEST_OUTLINE_COLOR);
    }
  }

  dispose(): void {
    this.graphics.destroy();
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

import { ARCHER_HITBOX_H, ARCHER_HITBOX_W, type Archer } from "@arrowfall/engine";
import { DEATH_DURATION_FRAMES, HEAD_HITBOX_H } from "@arrowfall/shared";
import { Container, Graphics } from "pixi.js";
import { archerColorFor, lighten, SHIELD_COLOR } from "../colors.js";

// Stateless renderer: clear + redraw every frame from the World snapshot.
// Phase 4 has no animation state to track; sprites/animations land Phase 10.
//
// Phase 9b: archers with `hasShield === true` get a soft pulsing white
// ring around their body so opponents can see at a glance that the
// kill won't connect on the first hit. The pulse uses an internal
// frame counter (not part of the engine state) — it's purely cosmetic.
export class ArchersRenderer {
  readonly view: Container;
  private readonly graphics: Graphics;
  private renderFrame = 0;

  constructor() {
    this.view = new Container();
    this.graphics = new Graphics();
    this.view.addChild(this.graphics);
  }

  render(archers: ReadonlyArray<Archer>): void {
    const g = this.graphics;
    g.clear();
    this.renderFrame += 1;

    for (let i = 0; i < archers.length; i++) {
      const a = archers[i]!;
      const bodyColor = archerColorFor(a.id, i);
      const headColor = lighten(bodyColor, 0.3);

      // Dead archers fade out over DEATH_DURATION_FRAMES then despawn
      // (handled by the engine). We render them in grey + alpha proportional
      // to remaining life; the engine drops them once timer maxes.
      const isDead = !a.alive;
      const aliveAlpha =
        a.spawnIframeTimer > 0
          ? // Spawn iframe — visible blink so the player knows they can't be hit yet.
            a.spawnIframeTimer % 8 < 4
            ? 0.5
            : 1.0
          : a.dodgeIframeTimer > 0
            ? 0.7
            : 1.0;
      const alpha = isDead ? 1.0 - a.deathTimer / DEATH_DURATION_FRAMES : aliveAlpha;

      const fillBody = isDead ? 0x666666 : bodyColor;
      const fillHead = isDead ? 0x999999 : headColor;

      // Phase 9b — shield ring. Drawn UNDER the body so the body still
      // reads cleanly. Pulse: alpha cycles between 0.4 and 0.85 over
      // 30 frames (0.5 s). Diameter = body diagonal + 4 px.
      if (!isDead && a.hasShield) {
        const cx = a.pos.x + ARCHER_HITBOX_W / 2;
        const cy = a.pos.y + ARCHER_HITBOX_H / 2;
        const radius = Math.ceil(
          Math.sqrt(
            (ARCHER_HITBOX_W / 2) ** 2 + (ARCHER_HITBOX_H / 2) ** 2,
          ) + 2,
        );
        const phase = (this.renderFrame % 30) / 30; // 0..1
        const pulse = 0.4 + 0.45 * (0.5 + 0.5 * Math.cos(phase * Math.PI * 2));
        g.circle(cx, cy, radius).stroke({
          color: SHIELD_COLOR,
          width: 1,
          alpha: pulse,
        });
      }

      // Body — full 8x11.
      g.rect(a.pos.x, a.pos.y, ARCHER_HITBOX_W, ARCHER_HITBOX_H).fill({
        color: fillBody,
        alpha,
      });
      // Head — top 3 px, lighter shade. Matches the stomp hitbox so the
      // visual cue lines up with the gameplay.
      g.rect(a.pos.x, a.pos.y, ARCHER_HITBOX_W, HEAD_HITBOX_H).fill({
        color: fillHead,
        alpha,
      });
      // Facing pixel — 1×1 px on the right or left edge of the face.
      // Vertically centred in the head strip (y = pos.y + 1).
      if (!isDead) {
        const facingX = a.facing === "R" ? a.pos.x + ARCHER_HITBOX_W - 1 : a.pos.x;
        g.rect(facingX, a.pos.y + 1, 1, 1).fill({ color: 0x000000, alpha });
      }
    }
  }

  dispose(): void {
    this.graphics.destroy();
    this.view.destroy();
  }
}

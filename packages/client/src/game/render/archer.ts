import { ARCHER_HITBOX_H, ARCHER_HITBOX_W, type Archer } from "@arrowfall/engine";
import { DEATH_DURATION_FRAMES, HEAD_HITBOX_H } from "@arrowfall/shared";
import { Container, Graphics, Sprite } from "pixi.js";
import { archerColorFor, lighten, SHIELD_COLOR } from "../colors.js";
import {
  ARCHER_SPRITE_OX,
  ARCHER_SPRITE_OY,
  ARCHER_SPRITE_SIZE,
  type AssetRegistry,
  type ArcherSkinId,
  type ArcherSpriteKey,
  ALL_ARCHER_SKINS,
  aimDirOf,
  SHIELD_FRAME_COUNT,
} from "../../assets/index.js";

// Stateless renderer: clear + redraw every frame from the World snapshot.
//
// Phase 10 — when assets are present, each archer is rendered via a
// Sprite pool keyed by archer.id. We pick the right frame per state:
//   !alive             → death_${0..3} faded by deathTimer
//   dodge timer active → dodge_${frame}
//   shoot timer high   → shoot_${frame}
//   aim input present  → aim_${dir}
//   vy < 0 grounded=no → jump
//   vy > 0 grounded=no → fall
//   |vx| > 0           → walk_${frame}
//   else               → idle_${frame}
//
// Skin assignment: archer.id ("p1".."p6") maps modulo to ALL_ARCHER_SKINS
// so the visual matches the slot the player picked. The engine doesn't
// know about skins — they live entirely in the renderer.
//
// Fallback path (assets === null) preserves the Phase-4/9b rectangles.

type ArcherSprite = {
  readonly sprite: Sprite;
  readonly shield: Sprite;
};

export class ArchersRenderer {
  readonly view: Container;
  private readonly graphics: Graphics; // fallback path
  private readonly sprites: Container;
  private readonly assets: AssetRegistry | null;
  private readonly pool = new Map<string, ArcherSprite>();
  private renderFrame = 0;

  constructor(assets: AssetRegistry | null) {
    this.view = new Container();
    this.graphics = new Graphics();
    this.sprites = new Container();
    this.view.addChild(this.graphics);
    this.view.addChild(this.sprites);
    this.assets = assets;
  }

  render(archers: ReadonlyArray<Archer>): void {
    this.renderFrame += 1;
    if (this.assets !== null) {
      this.renderSprites(archers, this.assets);
    } else {
      this.renderFallback(archers);
    }
  }

  private renderSprites(
    archers: ReadonlyArray<Archer>,
    assets: AssetRegistry,
  ): void {
    // Hide all pooled sprites first; we re-show the ones we touch.
    for (const { sprite, shield } of this.pool.values()) {
      sprite.visible = false;
      shield.visible = false;
    }

    for (let i = 0; i < archers.length; i++) {
      const a = archers[i]!;
      const skin = skinForArcher(a.id, i);
      const skinSprites = assets.archers.get(skin);
      if (skinSprites === undefined) continue;

      let entry = this.pool.get(a.id);
      if (entry === undefined) {
        entry = {
          sprite: new Sprite(),
          shield: new Sprite(),
        };
        // Centre the shield on the archer hitbox centre.
        entry.shield.anchor.set(0.5, 0.5);
        this.sprites.addChild(entry.shield);
        this.sprites.addChild(entry.sprite);
        this.pool.set(a.id, entry);
      }

      const key = pickFrame(a, this.renderFrame);
      const tex = skinSprites.get(key);
      if (tex === undefined) continue;

      entry.sprite.texture = tex;
      entry.sprite.x = a.pos.x + ARCHER_SPRITE_OX;
      entry.sprite.y = a.pos.y + ARCHER_SPRITE_OY;
      entry.sprite.visible = true;

      // Facing — flip horizontally for "L" so we can keep painting
      // archers facing right and mirror at render. Anchor recompensates
      // so the body stays in its original cell.
      if (a.facing === "L") {
        entry.sprite.scale.x = -1;
        entry.sprite.x = a.pos.x + ARCHER_SPRITE_OX + ARCHER_SPRITE_SIZE;
      } else {
        entry.sprite.scale.x = 1;
      }

      // Death fade.
      if (!a.alive) {
        entry.sprite.alpha = Math.max(
          0,
          1 - a.deathTimer / DEATH_DURATION_FRAMES,
        );
      } else if (a.spawnIframeTimer > 0) {
        entry.sprite.alpha = a.spawnIframeTimer % 8 < 4 ? 0.5 : 1.0;
      } else if (a.dodgeIframeTimer > 0) {
        entry.sprite.alpha = 0.7;
      } else {
        entry.sprite.alpha = 1.0;
      }

      // Shield overlay — pick frame from renderFrame for spinning sigils.
      if (a.alive && a.hasShield) {
        const sf = Math.floor(this.renderFrame / 6) % SHIELD_FRAME_COUNT;
        const stex = assets.shields.get(`shield_${sf}`);
        if (stex !== undefined) {
          entry.shield.texture = stex;
          entry.shield.x = a.pos.x + ARCHER_HITBOX_W / 2;
          entry.shield.y = a.pos.y + ARCHER_HITBOX_H / 2;
          // Pulse alpha 0.55 .. 0.95 over 30 render frames.
          const phase = (this.renderFrame % 30) / 30;
          entry.shield.alpha =
            0.55 + 0.4 * (0.5 + 0.5 * Math.cos(phase * Math.PI * 2));
          entry.shield.visible = true;
        }
      }
    }

    // Cull pooled sprites for archers that disappeared (e.g. left the
    // room). Iterating after the fact avoids invalidating the loop above.
    for (const [id, { sprite, shield }] of this.pool) {
      if (!sprite.visible && !shield.visible) {
        if (!archers.some((a) => a.id === id)) {
          sprite.destroy();
          shield.destroy();
          this.pool.delete(id);
        }
      }
    }
  }

  // Phase 4/9b fallback — kept verbatim so the visual regression-toggle
  // is meaningful. See git history for the original commentary.
  private renderFallback(archers: ReadonlyArray<Archer>): void {
    const g = this.graphics;
    g.clear();
    for (let i = 0; i < archers.length; i++) {
      const a = archers[i]!;
      const bodyColor = archerColorFor(a.id, i);
      const headColor = lighten(bodyColor, 0.3);
      const isDead = !a.alive;
      const aliveAlpha =
        a.spawnIframeTimer > 0
          ? a.spawnIframeTimer % 8 < 4
            ? 0.5
            : 1.0
          : a.dodgeIframeTimer > 0
            ? 0.7
            : 1.0;
      const alpha = isDead ? 1.0 - a.deathTimer / DEATH_DURATION_FRAMES : aliveAlpha;
      const fillBody = isDead ? 0x666666 : bodyColor;
      const fillHead = isDead ? 0x999999 : headColor;
      if (!isDead && a.hasShield) {
        const cx = a.pos.x + ARCHER_HITBOX_W / 2;
        const cy = a.pos.y + ARCHER_HITBOX_H / 2;
        const radius = Math.ceil(
          Math.sqrt((ARCHER_HITBOX_W / 2) ** 2 + (ARCHER_HITBOX_H / 2) ** 2) + 2,
        );
        const phase = (this.renderFrame % 30) / 30;
        const pulse = 0.4 + 0.45 * (0.5 + 0.5 * Math.cos(phase * Math.PI * 2));
        g.circle(cx, cy, radius).stroke({
          color: SHIELD_COLOR,
          width: 1,
          alpha: pulse,
        });
      }
      g.rect(a.pos.x, a.pos.y, ARCHER_HITBOX_W, ARCHER_HITBOX_H).fill({
        color: fillBody,
        alpha,
      });
      g.rect(a.pos.x, a.pos.y, ARCHER_HITBOX_W, HEAD_HITBOX_H).fill({
        color: fillHead,
        alpha,
      });
      if (!isDead) {
        const facingX = a.facing === "R" ? a.pos.x + ARCHER_HITBOX_W - 1 : a.pos.x;
        g.rect(facingX, a.pos.y + 1, 1, 1).fill({ color: 0x000000, alpha });
      }
    }
  }

  dispose(): void {
    for (const { sprite, shield } of this.pool.values()) {
      sprite.destroy();
      shield.destroy();
    }
    this.pool.clear();
    this.graphics.destroy();
    this.sprites.destroy({ children: true });
    this.view.destroy();
  }
}

// Map archer.id ("p1".."p6") modulo to one of the 6 visual skins.
// Falls back to a hash of the id if it doesn't match the pN pattern
// (e.g. networked sessions where the id is a Colyseus sessionId).
const skinForArcher = (id: string, fallbackIndex: number): ArcherSkinId => {
  const m = /^p(\d+)$/.exec(id);
  let slot: number;
  if (m && m[1] !== undefined) {
    slot = parseInt(m[1], 10) - 1;
  } else {
    let h = 0;
    for (let i = 0; i < id.length; i++) {
      h = (h * 31 + id.charCodeAt(i)) >>> 0;
    }
    slot = (h + fallbackIndex) % ALL_ARCHER_SKINS.length;
  }
  const safe =
    ((slot % ALL_ARCHER_SKINS.length) + ALL_ARCHER_SKINS.length) %
    ALL_ARCHER_SKINS.length;
  return ALL_ARCHER_SKINS[safe]!;
};

// Pick the animation frame key for an archer in its current state.
// `renderFrame` cycles the cosmetic anim counters (idle/walk/dodge/death)
// and is independent of the engine tick (these animations don't gate
// gameplay). Aim/shoot/jump/fall are state-driven, not time-driven.
const pickFrame = (a: Archer, renderFrame: number): ArcherSpriteKey => {
  const skin = skinForArcher(a.id, 0);
  const facing = a.facing;

  if (!a.alive) {
    const idx = Math.min(3, Math.floor(a.deathTimer / 6));
    return `${skin}_death_${idx}`;
  }

  if (a.dodgeIframeTimer > 0 && a.state === "dodging") {
    const idx = Math.floor(renderFrame / 2) % 4;
    return `${skin}_dodge_${idx}`;
  }

  // Shoot frame — recoil for a few frames after a fresh shot. We
  // approximate "just shot" by checking the cooldown timer ramp; the
  // engine resets cooldown to SHOOT_COOLDOWN_FRAMES (8) on shoot, so
  // 6..8 is "just fired".
  if (a.shootCooldownTimer >= 6) {
    const idx = Math.min(2, Math.max(0, 8 - a.shootCooldownTimer));
    return `${skin}_shoot_${idx}`;
  }

  // Aim — only when off-the-ground or visibly aiming. We don't have an
  // input snapshot here (the engine doesn't store the live input) so
  // fall back to the facing-only "E"/"W" aim. The full 8-direction
  // aim requires plumbing the last input through the world, which the
  // engine already does via `archer.aim` (Phase 3). If undefined, use
  // facing.
  // NB: archer.aim isn't part of the engine state today — leaving the
  // hook open for later.

  if (a.vel.y < -0.1) return `${skin}_jump`;
  if (a.vel.y > 0.5) return `${skin}_fall`;

  if (Math.abs(a.vel.x) > 0.05) {
    const idx = Math.floor(renderFrame / 5) % 6;
    return `${skin}_walk_${idx}`;
  }

  // Idle by default. Aim sprite reused for facing-only stance.
  void facing;
  const idx = Math.floor(renderFrame / 12) % 4;
  return `${skin}_idle_${idx}`;
};

// Re-export of aimDirOf for renderers that want to compute an aim
// direction from input (hot-seat path can pass it in if/when we wire
// the live aim through to the archer renderer).
export { aimDirOf };

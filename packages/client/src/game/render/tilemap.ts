import { type MapData, TILE_SIZE } from "@arrowfall/shared";
import { Container, Graphics, Sprite } from "pixi.js";
import { TILE_COLORS } from "../colors.js";
import { type AssetRegistry, variantKeyFor } from "../../assets/index.js";

// Static renderer: the map is built once into a Graphics or a Sprite
// tree and never rebuilt (no destruction tiles in the MVP).
//
// Phase 10: when an `assets` registry is supplied, we bake one Sprite
// per non-empty tile, picking a deterministic variant via tileSeed().
// When `assets === null` (VITE_NO_SPRITES=1) we fall back to the
// Phase 4 Graphics rect path — keeps a fast iterate-on-physics mode.
export class TilemapRenderer {
  readonly view: Container;
  private readonly graphics: Graphics;
  private readonly sprites: Container;

  constructor(map: MapData, assets: AssetRegistry | null) {
    this.view = new Container();
    this.graphics = new Graphics();
    this.sprites = new Container();
    this.view.addChild(this.graphics);
    this.view.addChild(this.sprites);

    if (assets !== null) {
      this.bakeSprites(map, assets);
    } else {
      this.bakeFallback(map);
    }
  }

  private bakeSprites(map: MapData, assets: AssetRegistry): void {
    const themeTiles = assets.tiles.get(map.theme);
    if (themeTiles === undefined) {
      // Should never happen — buildAllAssets covers ALL_THEMES. Fall
      // back to graphics rather than throw so a bad theme doesn't kill
      // the boot.
      console.warn(
        `[TilemapRenderer] missing tiles for theme "${map.theme}" — using fallback`,
      );
      this.bakeFallback(map);
      return;
    }
    for (let ty = 0; ty < map.height; ty++) {
      const row = map.tiles[ty]!;
      for (let tx = 0; tx < map.width; tx++) {
        const kind = row[tx]!;
        const key = variantKeyFor(map.theme, kind, tx, ty);
        if (key === null) continue; // EMPTY / SPAWN / CHEST_SPAWN
        const tex = themeTiles.get(key);
        if (tex === undefined) continue;
        const s = new Sprite(tex);
        s.x = tx * TILE_SIZE;
        s.y = ty * TILE_SIZE;
        this.sprites.addChild(s);
      }
    }
  }

  private bakeFallback(map: MapData): void {
    const g = this.graphics;
    g.clear();
    for (let ty = 0; ty < map.height; ty++) {
      const row = map.tiles[ty]!;
      for (let tx = 0; tx < map.width; tx++) {
        const kind = row[tx]!;
        const x = tx * TILE_SIZE;
        const y = ty * TILE_SIZE;
        switch (kind) {
          case "SOLID":
            g.rect(x, y, TILE_SIZE, TILE_SIZE).fill(TILE_COLORS.SOLID);
            break;
          case "JUMPTHRU":
            g.rect(x, y, TILE_SIZE, 4).fill(TILE_COLORS.JUMPTHRU);
            break;
          case "SPIKE":
            g.rect(x, y + TILE_SIZE - 4, TILE_SIZE, 4).fill(TILE_COLORS.SPIKE);
            for (let i = 0; i < 4; i++) {
              const baseX = x + i * 4;
              g.poly([
                baseX,
                y + TILE_SIZE - 4,
                baseX + 2,
                y + TILE_SIZE - 12,
                baseX + 4,
                y + TILE_SIZE - 4,
              ]).fill(TILE_COLORS.SPIKE);
            }
            break;
          case "EMPTY":
          case "SPAWN":
          case "CHEST_SPAWN":
            break;
        }
      }
    }
  }

  dispose(): void {
    this.graphics.destroy();
    this.sprites.destroy({ children: true });
    this.view.destroy();
  }
}

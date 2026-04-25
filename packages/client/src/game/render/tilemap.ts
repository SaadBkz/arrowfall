import { type MapData, TILE_SIZE } from "@arrowfall/shared";
import { Container, Graphics } from "pixi.js";
import { TILE_COLORS } from "../colors.js";

// Static renderer: the map is built once into a Graphics and never
// rebuilt (no destruction tiles in the MVP). Add the returned `view` to
// the gameRoot container.
export class TilemapRenderer {
  readonly view: Container;
  private readonly graphics: Graphics;

  constructor(map: MapData) {
    this.view = new Container();
    this.graphics = new Graphics();
    this.view.addChild(this.graphics);
    this.bake(map);
  }

  private bake(map: MapData): void {
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
            // Just a thin top strip — players can walk through it from
            // below. Visually mirrors the engine's collision semantics.
            g.rect(x, y, TILE_SIZE, 4).fill(TILE_COLORS.JUMPTHRU);
            break;
          case "SPIKE":
            // Base + 4 triangular spikes pointing up. Pure decoration —
            // the engine spike-kill resolver doesn't care about geometry.
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
            // Invisible in-game. SPAWN/CHEST_SPAWN are gameplay markers
            // that the world bakes into the World aggregate at create time.
            break;
        }
      }
    }
  }

  dispose(): void {
    this.graphics.destroy();
    this.view.destroy();
  }
}

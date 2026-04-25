import {
  type Archer,
  createWorld,
  parseMap,
  stepWorld,
  type World,
} from "@arrowfall/engine";
import {
  ARENA_HEIGHT_PX,
  ARENA_WIDTH_PX,
  type ArcherInput,
  type MapJson,
  TILE_SIZE,
  type Vec2,
} from "@arrowfall/shared";
import { type Application, Container, Graphics } from "pixi.js";
import { BG_COLOR } from "./colors.js";
import { KeyboardInput } from "./input.js";
import { runFixedStep } from "./loop.js";
import { ArchersRenderer } from "./render/archer.js";
import { ArrowsRenderer } from "./render/arrow.js";
import { HudRenderer } from "./render/hud.js";
import { TilemapRenderer } from "./render/tilemap.js";
import arenaJson from "../maps/arena-01.json" with { type: "json" };

// Fallback when archerColorFor decides to use the slot index — see
// archerColorFor; here we have just one archer so slot 0 fits.
const PLAYER_ID = "p1";

// One Game per page lifetime. Owns the Pixi app's stage tree, the
// engine `World` (mutated in place via reassignment), input listeners
// and the ticker callback. `start()` wires everything; `dispose()` would
// undo it (not currently called — page reload is the natural exit).
export class Game {
  private readonly app: Application;
  private readonly gameRoot: Container;
  private readonly bgGraphics: Graphics;
  private readonly tilemap: TilemapRenderer;
  private readonly archers: ArchersRenderer;
  private readonly arrows: ArrowsRenderer;
  private readonly hud: HudRenderer;
  private readonly input: KeyboardInput;

  private world: World;
  private accumulator = 0;
  private fps = 60;
  private readonly spawnPx: ReadonlyArray<Vec2>;
  private readonly tickerCallback: () => void;
  private readonly resizeListener: () => void;

  constructor(app: Application) {
    this.app = app;

    const map = parseMap(arenaJson as MapJson);
    if (map.spawns.length === 0) {
      throw new Error("arena-01: no SPAWN tile");
    }
    this.spawnPx = map.spawns.map((s) => ({
      x: s.x * TILE_SIZE,
      y: s.y * TILE_SIZE,
    }));

    // Logical-coords container. `stage.scale` would scale the HUD-fps
    // text the same as the playfield, so we place HUD inside this same
    // root: integer scaling preserves crisp pixels for both.
    this.gameRoot = new Container();
    this.app.stage.addChild(this.gameRoot);

    this.bgGraphics = new Graphics();
    this.bgGraphics
      .rect(0, 0, ARENA_WIDTH_PX, ARENA_HEIGHT_PX)
      .fill(BG_COLOR);
    this.gameRoot.addChild(this.bgGraphics);

    this.tilemap = new TilemapRenderer(map);
    this.gameRoot.addChild(this.tilemap.view);

    this.arrows = new ArrowsRenderer();
    this.gameRoot.addChild(this.arrows.view);

    this.archers = new ArchersRenderer();
    this.gameRoot.addChild(this.archers.view);

    this.hud = new HudRenderer();
    this.gameRoot.addChild(this.hud.view);

    this.world = createWorld(map, this.spawnPx, [PLAYER_ID]);

    this.input = new KeyboardInput();

    this.tickerCallback = () => this.tick();
    this.resizeListener = () => this.applyScale();
  }

  start(): void {
    this.input.attach(window);
    this.applyScale();
    window.addEventListener("resize", this.resizeListener);
    this.app.ticker.add(this.tickerCallback);
  }

  dispose(): void {
    this.app.ticker.remove(this.tickerCallback);
    window.removeEventListener("resize", this.resizeListener);
    this.input.dispose();
    this.tilemap.dispose();
    this.archers.dispose();
    this.arrows.dispose();
    this.hud.dispose();
  }

  // Computes the largest integer scale that fits 480×270 inside the
  // current canvas, then centres the playfield (letterbox). Integer-only
  // keeps the pixel-art style crisp; non-integer scales would introduce
  // visible bilinear smearing despite `image-rendering: pixelated`.
  private applyScale(): void {
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    const scale = Math.max(1, Math.floor(Math.min(w / ARENA_WIDTH_PX, h / ARENA_HEIGHT_PX)));
    this.gameRoot.scale.set(scale, scale);
    this.gameRoot.x = Math.floor((w - ARENA_WIDTH_PX * scale) / 2);
    this.gameRoot.y = Math.floor((h - ARENA_HEIGHT_PX * scale) / 2);
  }

  private resetWorld(): void {
    const map = this.world.map;
    this.world = createWorld(map, this.spawnPx, [PLAYER_ID]);
    this.accumulator = 0;
  }

  private tick(): void {
    // Reset is a frame-level action: handle once per render frame, before
    // the simulation steps consume their edges.
    if (this.input.consumeReset()) {
      this.resetWorld();
    }

    // Smooth FPS estimate for the HUD. Pixi exposes `ticker.FPS` directly.
    this.fps = this.app.ticker.FPS;

    const stepFn = (): void => {
      const archerInput: ArcherInput = this.input.snapshot();
      const inputs = new Map<string, ArcherInput>([[PLAYER_ID, archerInput]]);
      this.world = stepWorld(this.world, inputs);
      this.input.consumeEdges();
    };

    this.accumulator = runFixedStep(this.app.ticker.deltaMS, this.accumulator, stepFn);

    // Render the freshest world state.
    this.archers.render(sortedArchers(this.world));
    this.arrows.render(this.world.arrows);
    this.hud.update(this.world, this.fps);
  }
}

const sortedArchers = (world: World): ReadonlyArray<Archer> => {
  const ids = [...world.archers.keys()].sort();
  return ids.map((id) => world.archers.get(id)!);
};

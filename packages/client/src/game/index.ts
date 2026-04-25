import { type Archer, createWorld, parseMap, stepWorld, type World } from "@arrowfall/engine";
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
import { KeyboardInput, PLAYER_BINDINGS } from "./input.js";
import { runFixedStep } from "./loop.js";
import { ArchersRenderer } from "./render/archer.js";
import { ArrowsRenderer } from "./render/arrow.js";
import { HudRenderer } from "./render/hud.js";
import { RoundMessageRenderer } from "./render/round-message.js";
import { TilemapRenderer } from "./render/tilemap.js";
import { getRoundOutcome } from "./round-state.js";
import arena01Json from "../maps/arena-01.json" with { type: "json" };
import arena02Json from "../maps/arena-02.json" with { type: "json" };

// Phase 5 — hot-seat. Bump up to 4 to test 4-player on arena-02.
// Anything above 4 will reuse PLAYER_BINDINGS modulo length so it won't
// crash, but ergonomics break down past 2 players on a single keyboard
// (N-key rollover anti-ghost matrices) — gamepads are Phase 11.
const PLAYER_COUNT = 2;

// Maps switch automatically on PLAYER_COUNT: arena-01 ships with 2
// spawns (the existing 2P map), arena-02 ships with 4 spawns laid out
// quinconce so each quadrant gets one. createWorld wraps modulo if the
// counts don't match, so a 4-spawn map on a 2P round is harmless.
const MAP_FOR_2P = arena01Json as MapJson;
const MAP_FOR_4P = arena02Json as MapJson;

const playerIds = (count: number): ReadonlyArray<string> => {
  // Pick the first `count` ids from PLAYER_BINDINGS so the keyboard is
  // wired exactly to the players we spawn. The order matches slot index
  // (p1=red, p2=blue, p3=green, p4=yellow per `archerColorFor`).
  const ids = PLAYER_BINDINGS.slice(0, count).map((b) => b.id);
  if (ids.length === 0) throw new Error("PLAYER_COUNT must be ≥ 1");
  return ids;
};

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
  private readonly roundMessage: RoundMessageRenderer;
  private readonly input: KeyboardInput;

  private readonly playerIds: ReadonlyArray<string>;
  private world: World;
  private accumulator = 0;
  private fps = 60;
  private readonly spawnPx: ReadonlyArray<Vec2>;
  private readonly tickerCallback: () => void;
  private readonly resizeListener: () => void;

  constructor(app: Application) {
    this.app = app;
    this.playerIds = playerIds(PLAYER_COUNT);

    const mapJson = PLAYER_COUNT >= 3 ? MAP_FOR_4P : MAP_FOR_2P;
    const map = parseMap(mapJson);
    if (map.spawns.length === 0) {
      throw new Error(`${map.id}: no SPAWN tile`);
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
    this.bgGraphics.rect(0, 0, ARENA_WIDTH_PX, ARENA_HEIGHT_PX).fill(BG_COLOR);
    this.gameRoot.addChild(this.bgGraphics);

    this.tilemap = new TilemapRenderer(map);
    this.gameRoot.addChild(this.tilemap.view);

    this.arrows = new ArrowsRenderer();
    this.gameRoot.addChild(this.arrows.view);

    this.archers = new ArchersRenderer();
    this.gameRoot.addChild(this.archers.view);

    this.hud = new HudRenderer();
    this.gameRoot.addChild(this.hud.view);

    // Round-end overlay sits on top of everything so it stays readable
    // on top of fragmentation animations.
    this.roundMessage = new RoundMessageRenderer();
    this.gameRoot.addChild(this.roundMessage.view);

    this.world = createWorld(map, this.spawnPx, this.playerIds);

    // Only wire the active players' bindings — otherwise inactive slots
    // would silently swallow their keys (preventDefault) and consume CPU
    // looping over them on every keydown.
    this.input = new KeyboardInput(PLAYER_BINDINGS.slice(0, PLAYER_COUNT));

    this.tickerCallback = (): void => this.tick();
    this.resizeListener = (): void => this.applyScale();
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
    this.roundMessage.dispose();
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
    this.world = createWorld(map, this.spawnPx, this.playerIds);
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
      const inputs = new Map<string, ArcherInput>();
      for (const id of this.playerIds) {
        inputs.set(id, this.input.snapshot(id));
      }
      this.world = stepWorld(this.world, inputs);
      // Acknowledge each player's edges so a single press doesn't fire
      // shoot/dodge/jump on multiple ticks.
      for (const id of this.playerIds) {
        this.input.consumeEdges(id);
      }
    };

    this.accumulator = runFixedStep(this.app.ticker.deltaMS, this.accumulator, stepFn);

    // Render the freshest world state.
    this.archers.render(sortedArchers(this.world));
    this.arrows.render(this.world.arrows);
    this.hud.update(this.world, this.fps, this.playerIds);
    this.roundMessage.render(getRoundOutcome(this.world));
  }
}

const sortedArchers = (world: World): ReadonlyArray<Archer> => {
  const ids = [...world.archers.keys()].sort();
  return ids.map((id) => world.archers.get(id)!);
};

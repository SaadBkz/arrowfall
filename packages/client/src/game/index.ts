import { type Archer, createWorld, parseMap, stepWorld, type World } from "@arrowfall/engine";
import {
  ARENA_HEIGHT_PX,
  ARENA_WIDTH_PX,
  type ArcherInput,
  type MapData,
  type MapJson,
  TILE_SIZE,
  type Vec2,
} from "@arrowfall/shared";
import { type Application, Container, Graphics } from "pixi.js";
import type { Room } from "colyseus.js";
import { BG_COLOR } from "./colors.js";
import { KeyboardInput, PLAYER_BINDINGS } from "./input.js";
import { runFixedStep } from "./loop.js";
import { ArchersRenderer } from "./render/archer.js";
import { ArrowsRenderer } from "./render/arrow.js";
import { HudRenderer } from "./render/hud.js";
import { RoundMessageRenderer } from "./render/round-message.js";
import { TilemapRenderer } from "./render/tilemap.js";
import { getRoundOutcome } from "./round-state.js";
import { connectToArena, matchStateToWorld, type MatchState } from "../net/index.js";
import arena01Json from "../maps/arena-01.json" with { type: "json" };
import arena02Json from "../maps/arena-02.json" with { type: "json" };

// Phase 5 — hot-seat. Bump up to 4 to test 4-player on arena-02.
// Anything above 4 will reuse PLAYER_BINDINGS modulo length so it won't
// crash, but ergonomics break down past 2 players on a single keyboard
// (N-key rollover anti-ghost matrices) — gamepads are Phase 11.
const PLAYER_COUNT = 2;

export type GameMode = "local" | "networked";

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
//
// Mode:
//  - "local" (default) — Phase 5 hot-seat. PLAYER_COUNT archers on the
//    same keyboard, simulation runs locally via stepWorld.
//  - "networked" — Phase 6. Connects to the Colyseus arena room. Only
//    the p1 binding is wired (the local user's keys); the world is a
//    read-only mirror of the server's MatchState. Inputs are sent every
//    render frame; reset is sent as a "reset" message.
export class Game {
  private readonly mode: GameMode;
  private readonly app: Application;
  private readonly gameRoot: Container;
  private readonly bgGraphics: Graphics;
  private readonly tilemap: TilemapRenderer;
  private readonly archers: ArchersRenderer;
  private readonly arrows: ArrowsRenderer;
  private readonly hud: HudRenderer;
  private readonly roundMessage: RoundMessageRenderer;
  private readonly input: KeyboardInput;

  // For local mode: fixed list of slot ids p1..pN.
  // For networked mode: the local archer's binding id ("p1") only.
  // The HUD's per-row playerIds is recomputed each frame from the
  // world (so all online archers appear, sorted by slot id).
  private readonly localPlayerId: string;
  private readonly localBindings: ReadonlyArray<string>;
  private readonly mapData: MapData;
  private world: World;
  private accumulator = 0;
  private fps = 60;
  private readonly spawnPx: ReadonlyArray<Vec2>;
  private readonly tickerCallback: () => void;
  private readonly resizeListener: () => void;

  // Networked-mode state. `room` is null until joinOrCreate resolves.
  // `netStatus` is shown in the HUD ("connecting", "online — N", "error").
  private room: Room<MatchState> | null = null;
  private netStatus: "connecting" | "online" | "error" = "connecting";
  private netError: string | null = null;

  constructor(app: Application, mode: GameMode = "local") {
    this.app = app;
    this.mode = mode;

    if (mode === "networked") {
      // Networked uses p1 binding (arrows / Space / J / K) — most
      // ergonomic single-player layout. Other slots are the server's
      // problem: each tab is one client, which the server maps to its
      // own archer slot.
      this.localPlayerId = "p1";
      this.localBindings = ["p1"];
    } else {
      this.localPlayerId = "p1";
      this.localBindings = playerIds(PLAYER_COUNT);
    }

    const mapJson = mode === "networked" ? MAP_FOR_2P : PLAYER_COUNT >= 3 ? MAP_FOR_4P : MAP_FOR_2P;
    this.mapData = parseMap(mapJson);
    if (this.mapData.spawns.length === 0) {
      throw new Error(`${this.mapData.id}: no SPAWN tile`);
    }
    this.spawnPx = this.mapData.spawns.map((s) => ({
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

    this.tilemap = new TilemapRenderer(this.mapData);
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

    // Local mode seeds the world with the slot archers; networked mode
    // starts empty and waits for the server's first state snapshot.
    this.world =
      mode === "networked"
        ? createWorld(this.mapData, this.spawnPx, [])
        : createWorld(this.mapData, this.spawnPx, this.localBindings);

    // Only wire the active bindings. In networked mode that's just p1;
    // in local mode it's PLAYER_COUNT slots from PLAYER_BINDINGS.
    const activeBindings =
      mode === "networked"
        ? PLAYER_BINDINGS.slice(0, 1)
        : PLAYER_BINDINGS.slice(0, PLAYER_COUNT);
    this.input = new KeyboardInput(activeBindings);

    this.tickerCallback = (): void => this.tick();
    this.resizeListener = (): void => this.applyScale();
  }

  start(): void {
    this.input.attach(window);
    this.applyScale();
    window.addEventListener("resize", this.resizeListener);
    this.app.ticker.add(this.tickerCallback);
    if (this.mode === "networked") {
      this.connectAsync();
    }
  }

  // Fire-and-forget connection. Resolves into `this.room` if successful,
  // sets an error status otherwise. The render loop renders an empty
  // arena until the first state arrives.
  private async connectAsync(): Promise<void> {
    try {
      const room = await connectToArena();
      this.room = room;
      this.netStatus = "online";
      console.log(`[net] connected to arena (sessionId=${room.sessionId})`);
      room.onStateChange(() => {
        // Just stash state; tick() will read it next frame. We don't
        // re-render here directly — keeping rendering on the ticker
        // avoids redundant draws when patches arrive faster than the
        // browser repaints.
      });
      room.onLeave(() => {
        this.netStatus = "error";
        this.netError = "disconnected";
        this.room = null;
        console.warn("[net] room closed");
      });
    } catch (err) {
      this.netStatus = "error";
      this.netError = err instanceof Error ? err.message : String(err);
      console.error("[net] failed to connect:", err);
    }
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

  private resetWorldLocal(): void {
    this.world = createWorld(this.mapData, this.spawnPx, this.localBindings);
    this.accumulator = 0;
  }

  private tick(): void {
    this.fps = this.app.ticker.FPS;
    if (this.mode === "networked") {
      this.tickNetworked();
    } else {
      this.tickLocal();
    }
  }

  private tickLocal(): void {
    if (this.input.consumeReset()) {
      this.resetWorldLocal();
    }

    const stepFn = (): void => {
      const inputs = new Map<string, ArcherInput>();
      for (const id of this.localBindings) {
        inputs.set(id, this.input.snapshot(id));
      }
      this.world = stepWorld(this.world, inputs);
      for (const id of this.localBindings) {
        this.input.consumeEdges(id);
      }
    };

    this.accumulator = runFixedStep(this.app.ticker.deltaMS, this.accumulator, stepFn);

    this.archers.render(sortedArchers(this.world));
    this.arrows.render(this.world.arrows);
    this.hud.update(
      this.world,
      this.fps,
      this.localBindings,
      `local — ${this.localBindings.length} players`,
    );
    this.roundMessage.render(getRoundOutcome(this.world));
  }

  private tickNetworked(): void {
    // Reset edge → broadcast a "reset" message. Server gates by
    // NODE_ENV (dev only) — in prod this is silently ignored.
    if (this.input.consumeReset() && this.room !== null) {
      this.room.send("reset");
    }

    if (this.room !== null) {
      // Send the local input EVERY render frame. Colyseus throttles the
      // wire side; we don't coalesce on the JS side. Edge inputs (jump,
      // dodge, shoot) are consumed locally so a single keypress only
      // emits the edge in one outbound message.
      const input = this.input.snapshot(this.localPlayerId);
      this.room.send("input", input);
      this.input.consumeEdges(this.localPlayerId);

      // Mirror the latest schema state into a fresh World for rendering.
      this.world = matchStateToWorld(this.room.state, this.mapData);
    }

    // Render whatever world we have (empty until first state arrives).
    const archerIds = [...this.world.archers.keys()].sort();
    const badge =
      this.netStatus === "online"
        ? `online — ${archerIds.length} players`
        : this.netStatus === "connecting"
          ? "connecting…"
          : `error: ${this.netError ?? "unknown"}`;
    this.archers.render(sortedArchers(this.world));
    this.arrows.render(this.world.arrows);
    this.hud.update(this.world, this.fps, archerIds, badge);
    this.roundMessage.render(getRoundOutcome(this.world));
  }

  // Exposed for tests / debugging — read-only reflection of the
  // network status, not a control surface.
  getNetworkStatus(): { status: "connecting" | "online" | "error"; error: string | null } {
    return { status: this.netStatus, error: this.netError };
  }
}

const sortedArchers = (world: World): ReadonlyArray<Archer> => {
  const ids = [...world.archers.keys()].sort();
  return ids.map((id) => world.archers.get(id)!);
};

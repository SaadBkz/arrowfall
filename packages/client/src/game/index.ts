import {
  type Archer,
  createWorld,
  getRoundOutcome,
  parseMap,
  stepWorld,
  type World,
} from "@arrowfall/engine";
import {
  ARENA_HEIGHT_PX,
  ARENA_WIDTH_PX,
  type ArcherInput,
  type MapData,
  type MapJson,
  TILE_SIZE,
  type Vec2,
} from "@arrowfall/shared";
import { type Application, Container } from "pixi.js";
import type { Room } from "colyseus.js";
import { KeyboardInput, PLAYER_BINDINGS } from "./input.js";
import { runFixedStep } from "./loop.js";
import { ArchersRenderer } from "./render/archer.js";
import { ArrowsRenderer } from "./render/arrow.js";
import { BackgroundRenderer } from "./render/background.js";
import { ChestsRenderer } from "./render/chest.js";
import { HudRenderer } from "./render/hud.js";
import { RoundMessageRenderer } from "./render/round-message.js";
import { TilemapRenderer } from "./render/tilemap.js";
import {
  archerFromSnapshot,
  type MatchState,
  PredictionEngine,
  RemoteInterpolator,
} from "../net/index.js";
import type { AssetRegistry } from "../assets/index.js";
import arena01Json from "../maps/arena-01.json" with { type: "json" };
import arena02Json from "../maps/arena-02.json" with { type: "json" };
import sacredGroveJson from "../maps/sacred-grove.json" with { type: "json" };
import twinSpiresJson from "../maps/twin-spires.json" with { type: "json" };
import oldTempleJson from "../maps/old-temple.json" with { type: "json" };

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

// Phase 10 — themed maps. Cycled in local mode via the M key. Each
// has its own theme + spawn layout. Chosen so the visual variety is
// immediately apparent (forest / spires / temple).
const THEMED_MAPS: ReadonlyArray<MapJson> = [
  sacredGroveJson as MapJson,
  twinSpiresJson as MapJson,
  oldTempleJson as MapJson,
];

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
  private readonly background: BackgroundRenderer;
  private tilemap: TilemapRenderer;
  private readonly archers: ArchersRenderer;
  private readonly arrows: ArrowsRenderer;
  private readonly chests: ChestsRenderer;
  private readonly hud: HudRenderer;
  private readonly roundMessage: RoundMessageRenderer;
  private readonly input: KeyboardInput;
  private readonly assets: AssetRegistry | null;
  // Phase 10 — local-mode map cycler. Index into THEMED_MAPS, advanced
  // by the M key. Networked mode ignores this (the server picks the map).
  private themedMapIndex = 0;
  private cycleMapHandler: ((e: KeyboardEvent) => void) | null = null;

  // For local mode: fixed list of slot ids p1..pN.
  // For networked mode: the local archer's binding id ("p1") only.
  // The HUD's per-row playerIds is recomputed each frame from the
  // world (so all online archers appear, sorted by slot id).
  private readonly localPlayerId: string;
  private readonly localBindings: ReadonlyArray<string>;
  // Phase 10 — `mapData` and `spawnPx` are reassigned by cycleThemedMap
  // in local mode (M-key cycles through THEMED_MAPS). Networked mode
  // never reassigns them — the server picks the map.
  private mapData: MapData;
  private world: World;
  private accumulator = 0;
  private fps = 60;
  private spawnPx: ReadonlyArray<Vec2>;
  private readonly tickerCallback: () => void;
  private readonly resizeListener: () => void;

  // Networked-mode state. The room is supplied by main.ts after the
  // user has gone through the menu (Phase 8). In local mode it stays null.
  // `netStatus` is shown in the HUD ("connecting", "online", "error").
  private room: Room<MatchState> | null = null;
  private netStatus: "connecting" | "online" | "error" = "connecting";
  private netError: string | null = null;

  // Phase 7 — local prediction + remote interpolation. Both null in
  // local mode; instantiated alongside the room in attachRoom().
  private prediction: PredictionEngine | null = null;
  private interpolator: RemoteInterpolator | null = null;

  // Phase 8 — observers notified whenever the server's state.phase
  // string changes. The menu overlay registers here so it can swap
  // panels (lobby ↔ hidden ↔ match-end) at the right moment without
  // needing to subscribe to the room directly.
  private phaseListeners: Array<(phase: string) => void> = [];
  private lastSeenPhase: string = "lobby";

  constructor(
    app: Application,
    mode: GameMode = "local",
    room: Room<MatchState> | null = null,
    assets: AssetRegistry | null = null,
  ) {
    this.app = app;
    this.mode = mode;
    this.assets = assets;

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

    // Local mode now starts on the first themed map (sacred-grove).
    // Networked mode keeps using the legacy arena-01/02 layout — the
    // server doesn't know about themed maps yet (Phase 11 wiring will
    // surface the map picker through the lobby).
    const mapJson =
      mode === "networked"
        ? MAP_FOR_2P
        : PLAYER_COUNT >= 3
          ? MAP_FOR_4P
          : THEMED_MAPS[this.themedMapIndex]!;
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

    // Background sits at the very bottom of the stage tree. In sprite
    // mode it draws back+mid parallax layers; in fallback it's just a
    // solid BG_COLOR rect — same z-order as the Phase 4 bgGraphics.
    this.background = new BackgroundRenderer(this.assets);
    this.background.setTheme(this.mapData.theme);
    this.gameRoot.addChild(this.background.view);

    this.tilemap = new TilemapRenderer(this.mapData, this.assets);
    this.gameRoot.addChild(this.tilemap.view);

    this.arrows = new ArrowsRenderer(this.assets);
    this.gameRoot.addChild(this.arrows.view);

    // Chests sit between arrows and archers so an archer standing on
    // top of a chest is drawn over the chest (not the other way around).
    this.chests = new ChestsRenderer(this.assets);
    this.gameRoot.addChild(this.chests.view);

    this.archers = new ArchersRenderer(this.assets);
    this.gameRoot.addChild(this.archers.view);

    void ARENA_WIDTH_PX;
    void ARENA_HEIGHT_PX;

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
      mode === "networked" ? PLAYER_BINDINGS.slice(0, 1) : PLAYER_BINDINGS.slice(0, PLAYER_COUNT);
    this.input = new KeyboardInput(activeBindings);

    this.tickerCallback = (): void => this.tick();
    this.resizeListener = (): void => this.applyScale();

    // If main.ts already handed us a connected room, plug it in straight
    // away — `start()` will register listeners after the ticker is up.
    if (room !== null) {
      this.attachRoom(room);
    }
  }

  start(): void {
    this.input.attach(window);
    this.applyScale();
    window.addEventListener("resize", this.resizeListener);
    this.app.ticker.add(this.tickerCallback);

    // Phase 10 — M cycles the local themed map. Only effective in
    // local mode (the server picks the map in networked mode). Listener
    // sits outside KeyboardInput so it doesn't perturb the per-player
    // bindings or trigger preventDefault.
    //
    // Layout note: matches `event.key` (the printed character) rather
    // than `event.code` (the physical key). The per-player bindings
    // intentionally use `event.code` so ZQSD on AZERTY = WASD on
    // QWERTY (same physical positions); the M-cycler is different
    // because the user looks for the *visible* "M" on their keyboard,
    // which sits at different physical positions on AZERTY vs QWERTY.
    if (this.mode === "local") {
      this.cycleMapHandler = (e: KeyboardEvent): void => {
        if (e.key.toLowerCase() === "m" && !e.repeat) {
          this.cycleThemedMap();
        }
      };
      window.addEventListener("keydown", this.cycleMapHandler);
    }
  }

  // Cycle to the next themed map: rebuild tilemap renderer + world,
  // reset background theme. The cycler is a no-op in 4P mode (we
  // already use arena-02 there for the spawn count). Called by the
  // M-key listener.
  private cycleThemedMap(): void {
    if (PLAYER_COUNT >= 3) return; // 4P stays on arena-02
    this.themedMapIndex = (this.themedMapIndex + 1) % THEMED_MAPS.length;
    const next = parseMap(THEMED_MAPS[this.themedMapIndex]!);
    // Replace map data + spawn cache. This is a "live" reset — the
    // current archers and arrows are blown away by createWorld below.
    this.mapData = next;
    this.spawnPx = next.spawns.map((s) => ({
      x: s.x * TILE_SIZE,
      y: s.y * TILE_SIZE,
    }));

    // Tear down old tilemap, build a new one for the new theme.
    this.gameRoot.removeChild(this.tilemap.view);
    this.tilemap.dispose();
    this.tilemap = new TilemapRenderer(next, this.assets);
    // Re-insert at the right z-position (just above the background).
    this.gameRoot.addChildAt(this.tilemap.view, 1);

    this.background.setTheme(next.theme);
    this.resetWorldLocal();
    console.log(`[arrowfall] map → ${next.id} (${next.theme})`);
  }

  // Plug in a Colyseus room obtained externally (Phase 8 menu flow).
  // Idempotent enough — calling it twice with different rooms is a
  // programming error (we throw rather than reach for hidden cleanup).
  attachRoom(room: Room<MatchState>): void {
    if (this.room !== null) {
      throw new Error("Game.attachRoom: a room is already attached");
    }
    this.room = room;
    this.netStatus = "online";
    this.lastSeenPhase = room.state.phase || "lobby";
    console.log(
      `[net] attached room (code=${room.state.roomCode} sessionId=${room.sessionId})`,
    );

    this.prediction = new PredictionEngine(this.mapData, this.spawnPx);
    this.interpolator = new RemoteInterpolator();

    room.onStateChange(() => {
      // Reconcile + ingest happen synchronously here. Reconcile
      // mutates the predicted world and may arm a correction lerp;
      // ingest pushes a snapshot into the per-session buffer.
      this.prediction?.reconcile(room.state, room.sessionId);
      this.interpolator?.ingest(room.state, room.sessionId);

      // Notify menu observers when the server transitions phase. We
      // emit on every state change too — the menu re-renders the
      // lobby on score/ready toggles even if the phase stays "lobby".
      const phase = room.state.phase;
      const phaseChanged = phase !== this.lastSeenPhase;
      this.lastSeenPhase = phase;
      for (const fn of this.phaseListeners) fn(phase);
      if (phaseChanged) {
        console.log(`[net] phase -> ${phase}`);
      }
    });
    room.onLeave(() => {
      this.netStatus = "error";
      this.netError = "disconnected";
      this.room = null;
      console.warn("[net] room closed");
    });
  }

  // Phase 8 — main.ts subscribes to phase changes so the menu overlay
  // can show/hide at the right moment. Listener is invoked once per
  // server state patch, with the latest phase string.
  onPhaseChange(listener: (phase: string) => void): void {
    this.phaseListeners.push(listener);
  }

  // Toggle the local player's lobby ready flag. The server is the
  // source of truth — this just sends the wire message and lets the
  // resulting state patch flow back through onStateChange.
  sendReady(ready: boolean): void {
    this.room?.send("ready", { ready });
  }

  getRoom(): Room<MatchState> | null {
    return this.room;
  }

  dispose(): void {
    this.app.ticker.remove(this.tickerCallback);
    window.removeEventListener("resize", this.resizeListener);
    if (this.cycleMapHandler !== null) {
      window.removeEventListener("keydown", this.cycleMapHandler);
      this.cycleMapHandler = null;
    }
    this.input.dispose();
    this.tilemap.dispose();
    this.archers.dispose();
    this.arrows.dispose();
    this.chests.dispose();
    this.background.dispose();
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

    this.background.update(this.world.tick);
    this.archers.render(sortedArchers(this.world));
    this.arrows.render(this.world.arrows);
    this.chests.render(this.world.chests);
    this.hud.update(
      this.world,
      this.fps,
      this.localBindings,
      `local — ${this.localBindings.length} players · [M] map`,
    );
    this.roundMessage.render(getRoundOutcome(this.world));
  }

  private tickNetworked(): void {
    // Reset edge → broadcast a "reset" message. Server gates by
    // NODE_ENV (dev only) — in prod this is silently ignored. Reset
    // is also gated client-side by phase: lobby/match-end are already
    // post-reset, so the keystroke would be a no-op there anyway.
    const phase = this.room?.state.phase ?? "lobby";
    const isLive = phase === "playing" || phase === "round-end";
    if (this.input.consumeReset() && this.room !== null && isLive) {
      this.room.send("reset");
    }

    // Drive the predicted world only while the server is simulating
    // (playing / round-end). In lobby and match-end the server pauses
    // the world, so stepping locally would diverge and burn correction
    // lerps the moment play resumes. We still drain edges so a queued
    // keypress doesn't fire instantly when the next round starts.
    if (this.room !== null && this.prediction !== null && isLive) {
      const room = this.room;
      const prediction = this.prediction;
      const stepFn = (): void => {
        const input = this.input.snapshot(this.localPlayerId);
        const clientTick = prediction.stepLocal(input);
        // Spread to a plain wire object — Colyseus serializes whatever
        // we hand it, but mixing the engine's readonly ArcherInput with
        // the wire-only clientTick under one type would leak network
        // metadata into shared. The validator on the server tolerates
        // the extra field.
        room.send("input", { ...input, clientTick });
        this.input.consumeEdges(this.localPlayerId);
      };
      this.accumulator = runFixedStep(this.app.ticker.deltaMS, this.accumulator, stepFn);
    } else {
      // Drop any queued accumulator so we don't burst-step when play
      // resumes after a long lobby pause.
      this.accumulator = 0;
      this.input.consumeEdges(this.localPlayerId);
    }

    // Compose the render world: predicted local + interpolated remotes
    // + correction offset on the local archer.
    this.world = this.composeRenderWorld();

    const archerIds = [...this.world.archers.keys()].sort();
    const score = this.formatScoreBadge();
    const badge =
      this.netStatus === "online"
        ? `${this.room?.state.roomCode ?? "----"} · ${phase} · ${score}`
        : this.netStatus === "connecting"
          ? "connecting…"
          : `error: ${this.netError ?? "unknown"}`;
    this.background.update(this.world.tick);
    this.archers.render(sortedArchers(this.world));
    this.arrows.render(this.world.arrows);
    this.chests.render(this.world.chests);
    this.hud.update(this.world, this.fps, archerIds, badge);
    // Round-end overlay is driven by server phase rather than local
    // alive-count: the freeze starts when the server says so, and we
    // surface the authoritative roundWinner.
    this.roundMessage.render(this.composeRoundOverlay());
  }

  // Build the "p1 1 / p2 0" string shown in the HUD during networked
  // play. Uses the slot id (p1..p6) so colors line up with the rest
  // of the UI.
  //
  // Defensive against a quirk of @colyseus/schema 3.x: the wire decoder
  // bypasses our MatchState constructor (Object.create) and only
  // populates collection fields once the server emits a patch touching
  // them. During the very first ticks after attachRoom, `archers` /
  // `wins` can be undefined, which used to throw at .forEach() and kill
  // the ticker.
  private formatScoreBadge(): string {
    if (this.room === null) return "";
    const state = this.room.state;
    const archers = state.archers;
    const wins = state.wins;
    if (archers === undefined) return "";
    const parts: string[] = [];
    archers.forEach((archer, sessionId) => {
      const w = wins?.get(sessionId) ?? 0;
      parts.push(`${archer.id} ${w}`);
    });
    parts.sort();
    const target = state.targetWins ?? 0;
    return `${parts.join(" / ")} (to ${target})`;
  }

  // Translate the server's authoritative round-winner into the same
  // RoundOutcome shape the existing PixiJS overlay already understands.
  // We could surface a Phase-8-specific overlay (with the score line),
  // but the existing renderer covers 80% of the value with zero new
  // code — Phase 9 can pretty it up if needed.
  private composeRoundOverlay():
    | { readonly kind: "ongoing" }
    | { readonly kind: "win"; readonly winnerId: string }
    | { readonly kind: "draw" } {
    if (this.room === null) return { kind: "ongoing" };
    const state = this.room.state;
    if (state.phase !== "round-end") return { kind: "ongoing" };
    const winnerSession = state.roundWinnerSessionId;
    if (winnerSession === "") return { kind: "draw" };
    // Same @colyseus/schema 3.x quirk as formatScoreBadge — archers can
    // be undefined for one tick after attachRoom.
    const winnerArcher = state.archers?.get(winnerSession);
    if (winnerArcher === undefined) return { kind: "draw" };
    return { kind: "win", winnerId: winnerArcher.id };
  }

  // Returns the world the renderer should draw this frame, layered:
  //   1. predicted world (or empty placeholder pre-connect)
  //   2. interpolated remote archers replace their predicted positions
  //   3. correction lerp offset is added to the local archer's render pos
  // Arrows stay on the predicted world — they're owned-by-engine
  // physics; interpolating them is Phase-9 territory if needed.
  private composeRenderWorld(): World {
    if (this.prediction === null || this.interpolator === null || this.room === null) {
      return this.world;
    }
    const predWorld = this.prediction.getPredictedWorld();
    const archers = new Map<string, Archer>();
    for (const [id, a] of predWorld.archers) {
      archers.set(id, a);
    }

    // Override remote archer positions with interpolated snapshots.
    // Cold-start sessions (< 2 snapshots) keep the predicted position
    // — a brief stutter on first appearance is preferable to extrapolating
    // off an empty buffer.
    const localSlot = this.prediction.getLocalSlotId();
    this.interpolator.forEach((sessionId, snap) => {
      if (this.interpolator!.isColdStart(sessionId)) return;
      const a = archerFromSnapshot(snap);
      if (a.id === localSlot) return; // never override our own predicted pos
      archers.set(a.id, a);
    });

    // Correction lerp on the local archer. Decays to (0,0) over
    // CORRECTION_LERP_FRAMES — see prediction.ts.
    if (localSlot !== null) {
      const localA = archers.get(localSlot);
      if (localA !== undefined) {
        const offset = this.prediction.getRenderCorrection();
        if (offset.x !== 0 || offset.y !== 0) {
          archers.set(localSlot, {
            ...localA,
            pos: { x: localA.pos.x + offset.x, y: localA.pos.y + offset.y },
          });
        }
      }
    }

    return {
      map: predWorld.map,
      archers,
      arrows: predWorld.arrows,
      chests: predWorld.chests,
      tick: predWorld.tick,
      events: predWorld.events,
    };
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

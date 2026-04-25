import { Room, type Client } from "colyseus";
import {
  type ArcherInput,
  type MapData,
  type MapJson,
  NEUTRAL_INPUT,
  TILE_SIZE,
  type Vec2,
} from "@arrowfall/shared";
import { createWorld, parseMap, stepWorld, type World } from "@arrowfall/engine";
import { MatchState, worldToMatchState } from "../state/index.js";
import arena01Json from "../maps/arena-01.json" with { type: "json" };
import { validateInput } from "./validate-input.js";

// Spec §0 — 2-6 players per room.
const MAX_CLIENTS = 6;

// 60 Hz logical step (matches engine determinism). Patches go out at
// 30 Hz via setPatchRate (Phase 6 — naïve sync; Phase 7 will add
// prediction/reconciliation client-side).
const SIMULATION_INTERVAL_MS = 1000 / 60;
const PATCH_INTERVAL_MS = 1000 / 30;

// Stable archer-id factory. Sessions get assigned p1..p6 in arrival
// order; if a player leaves, their slot is freed and the next joiner
// reuses it. Keeps slot ids tiny for HUD / colors (matches the client's
// PLAYER_BINDINGS p1..p4 convention).
const ARCHER_SLOTS = ["p1", "p2", "p3", "p4", "p5", "p6"] as const;

// Toggle for the dev-only reset message. Production rooms ignore reset
// to prevent griefing. NODE_ENV=test treats as dev.
const RESET_ALLOWED = process.env["NODE_ENV"] !== "production";

export class ArenaRoom extends Room<MatchState> {
  override maxClients = MAX_CLIENTS;

  // Authoritative world — the source of truth. The schema state mirrors
  // it via worldToMatchState(); never mutate state directly elsewhere.
  private world!: World;
  private mapData!: MapData;
  private spawnsPx!: ReadonlyArray<Vec2>;

  // sessionId -> archer slot id (p1..p6).
  private readonly archerIdBySession = new Map<string, string>();

  // Slot id -> last validated input (overwritten each onMessage). The
  // simulate step pulls the latest value at tick boundary; older inputs
  // are dropped — Phase 6 uses last-write-wins, no per-tick queue.
  private readonly inputs = new Map<string, ArcherInput>();

  override onCreate(_options: unknown): void {
    this.mapData = parseMap(arena01Json as MapJson);
    if (this.mapData.spawns.length === 0) {
      throw new Error(`ArenaRoom: ${this.mapData.id} has no SPAWN tile`);
    }
    this.spawnsPx = this.mapData.spawns.map((s) => ({
      x: s.x * TILE_SIZE,
      y: s.y * TILE_SIZE,
    }));

    this.setState(new MatchState());
    this.state.mapId = this.mapData.id;

    // Empty world initially. Each onJoin recreates the world with the
    // current archer roster — the simplest correct strategy for Phase 6.
    // Phase 8 (lobby + matchmaking) will revisit so mid-round joins
    // don't reset everyone.
    this.world = createWorld(this.mapData, this.spawnsPx, []);
    worldToMatchState(this.world, this.state);

    this.setSimulationInterval((dtMs) => this.simulate(dtMs), SIMULATION_INTERVAL_MS);
    this.setPatchRate(PATCH_INTERVAL_MS);

    this.onMessage("input", (client, payload: unknown) => {
      const archerId = this.archerIdBySession.get(client.sessionId);
      if (archerId === undefined) return;
      this.inputs.set(archerId, validateInput(payload));
    });

    this.onMessage("reset", (client) => {
      if (!RESET_ALLOWED) return;
      console.log(`[arena] reset requested by ${client.sessionId}`);
      this.world = createWorld(this.mapData, this.spawnsPx, [
        ...this.archerIdBySession.values(),
      ]);
      this.inputs.clear();
      worldToMatchState(this.world, this.state);
    });

    console.log(`[arena] room created (mapId=${this.mapData.id})`);
  }

  override onJoin(client: Client, _options: unknown): void {
    const archerId = this.allocateArcherId();
    if (archerId === null) {
      // Shouldn't happen — Colyseus enforces maxClients before onJoin —
      // but defensive in case the limit is bumped without updating slots.
      throw new Error(`[arena] no free archer slot for ${client.sessionId}`);
    }
    this.archerIdBySession.set(client.sessionId, archerId);

    // Mid-round respawn-everyone semantics (Phase 6 trade-off): rebuild
    // the world with the new roster. Existing players lose their
    // current position but keep playing. Phase 8 will keep the in-flight
    // round and queue joiners for the next round.
    this.rebuildWorld();
    console.log(
      `[arena] joined ${client.sessionId} as ${archerId} (${this.archerIdBySession.size}/${MAX_CLIENTS})`,
    );
  }

  override onLeave(client: Client, _consented: boolean): void {
    const archerId = this.archerIdBySession.get(client.sessionId);
    if (archerId === undefined) return;
    this.archerIdBySession.delete(client.sessionId);
    this.inputs.delete(archerId);

    // Phase 6 leave semantics (per spec §8.6 with simplification): the
    // archer is removed from the World cleanly — no death animation,
    // no event, no kill credit. Treating disconnect as instakill would
    // require the engine to grow a 'disconnect' WorldEvent cause; we
    // keep the engine pure and let the room handle this room-level
    // concern by just dropping the archer.
    this.rebuildWorld();
    console.log(
      `[arena] left ${client.sessionId} (${archerId}) (${this.archerIdBySession.size}/${MAX_CLIENTS})`,
    );
  }

  // Test hook — exposes the internal world so tests can assert engine
  // state after onJoin / onMessage. Not used in production code.
  getWorldForTest(): World {
    return this.world;
  }

  private allocateArcherId(): string | null {
    const used = new Set(this.archerIdBySession.values());
    for (const id of ARCHER_SLOTS) {
      if (!used.has(id)) return id;
    }
    return null;
  }

  private rebuildWorld(): void {
    this.world = createWorld(this.mapData, this.spawnsPx, [
      ...this.archerIdBySession.values(),
    ]);
    worldToMatchState(this.world, this.state);
  }

  private simulate(_dtMs: number): void {
    // Build the input map for this tick. NEUTRAL_INPUT for any archer
    // we haven't received a payload for yet. After stepping we clear
    // edges (jump/dodge/shoot) so a single keypress doesn't fire on
    // multiple ticks — same convention the client follows in hot-seat.
    const tickInputs = new Map<string, ArcherInput>();
    for (const archerId of this.archerIdBySession.values()) {
      tickInputs.set(archerId, this.inputs.get(archerId) ?? NEUTRAL_INPUT);
    }

    try {
      this.world = stepWorld(this.world, tickInputs);
    } catch (err) {
      console.error("[arena] simulate error:", err);
      return;
    }

    // Clear edge inputs after the step. Levels (left/right/up/down/jumpHeld)
    // persist until the client sends a new input (which it does every
    // frame anyway).
    for (const [id, prev] of this.inputs) {
      if (prev.jump || prev.dodge || prev.shoot) {
        this.inputs.set(id, { ...prev, jump: false, dodge: false, shoot: false });
      }
    }

    worldToMatchState(this.world, this.state);
  }
}

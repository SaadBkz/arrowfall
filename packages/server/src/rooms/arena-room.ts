import { Room, type Client } from "colyseus";
import {
  type ArcherInput,
  type MapData,
  type MapJson,
  NEUTRAL_INPUT,
  TILE_SIZE,
  type Vec2,
} from "@arrowfall/shared";
import {
  createWorld,
  getRoundOutcome,
  parseMap,
  stepWorld,
  type World,
} from "@arrowfall/engine";
import { MatchState, worldToMatchState } from "../state/index.js";
import arena01Json from "../maps/arena-01.json" with { type: "json" };
import { validateClientTick, validateInput } from "./validate-input.js";
import {
  isValidRoomCode,
  normalizeRoomCode,
  pickAvailableRoomCode,
  releaseRoomCode,
  reserveRoomCode,
} from "./room-codes.js";

// Spec §0 — 2-6 players per room.
const MAX_CLIENTS = 6;

// 60 Hz logical step (matches engine determinism). Patches go out at
// 30 Hz via setPatchRate.
const SIMULATION_INTERVAL_MS = 1000 / 60;
const PATCH_INTERVAL_MS = 1000 / 30;

// Stable archer-id factory. Sessions get assigned p1..p6 in arrival
// order; if a player leaves, their slot is freed and the next joiner
// reuses it. Keeps slot ids tiny for HUD / colors.
const ARCHER_SLOTS = ["p1", "p2", "p3", "p4", "p5", "p6"] as const;

// Toggle for the dev-only reset message. Production rooms ignore reset
// to prevent griefing. NODE_ENV=test treats as dev.
const RESET_ALLOWED = process.env["NODE_ENV"] !== "production";

// Phase 8 — match flow constants. Tuned for snappy MVP feel:
//   - ROUND_END pauses 3 s on the win text so the winner can be read
//     and the death animation finishes underneath.
//   - MATCH_END pauses 6 s on the trophy screen — long enough to read
//     the final score before everyone is dropped back into the lobby.
//   - TARGET_WINS = 3 keeps a match in the 3-7 minute range typical of
//     TowerFall sessions; the host can override via create options.
const ROUND_END_DELAY_FRAMES = 180;
const MATCH_END_DELAY_FRAMES = 360;
const DEFAULT_TARGET_WINS = 3;

// Minimum players required to start a match. Hot-seat 1P would have no
// opponent (and getRoundOutcome would immediately freeze on a 1-alive
// "win"), so we lock the lobby below this threshold.
const MIN_PLAYERS_TO_START = 2;

export type ArenaRoomOptions = {
  // Room code — normalized + validated in onCreate. If absent, the
  // room generates one. Either way the canonical 4-letter form ends
  // up in state.roomCode and the matchmaker filterBy uses options.code
  // to route subsequent join({ code }) requests.
  readonly code?: string;
  // Optional override of the default 3 wins to win the match. Clamped
  // to [1, 9] so a UI showing single-digit scores stays aligned.
  readonly targetWins?: number;
};

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
  // are dropped — last-write-wins, no per-tick queue.
  private readonly inputs = new Map<string, ArcherInput>();

  // sessionId -> latest clientTick the room has applied. Phase 7 ack
  // channel; mirrored verbatim into state.lastInputTick.
  private readonly lastClientTickBySession = new Map<string, number>();

  // Owned room code — released in onDispose so the registry doesn't leak.
  private ownedCode: string | null = null;

  override onCreate(options: ArenaRoomOptions = {}): void {
    this.mapData = parseMap(arena01Json as MapJson);
    if (this.mapData.spawns.length === 0) {
      throw new Error(`ArenaRoom: ${this.mapData.id} has no SPAWN tile`);
    }
    this.spawnsPx = this.mapData.spawns.map((s) => ({
      x: s.x * TILE_SIZE,
      y: s.y * TILE_SIZE,
    }));

    const code = this.allocateRoomCode(options.code);
    this.ownedCode = code;

    // The matchmaker reads `code` directly from the options that were
    // passed to create() in order to satisfy filterBy(["code"]) — no
    // need to mirror it via setMetadata. We keep state.roomCode for
    // the client-side display + late-arriving wire reads.

    this.setState(new MatchState());
    this.state.mapId = this.mapData.id;
    this.state.roomCode = code;
    this.state.targetWins = clampTargetWins(options.targetWins);

    // Empty world initially. Players will be spawned at start-match
    // time (or on join while still in lobby).
    this.world = createWorld(this.mapData, this.spawnsPx, []);
    worldToMatchState(
      this.world,
      this.state,
      this.archerIdBySession,
      this.lastClientTickBySession,
    );

    this.setSimulationInterval((dtMs) => this.simulate(dtMs), SIMULATION_INTERVAL_MS);
    this.setPatchRate(PATCH_INTERVAL_MS);

    this.onMessage("input", (client, payload: unknown) =>
      this.handleInput(client.sessionId, payload),
    );
    this.onMessage("reset", (client) => this.handleReset(client.sessionId));
    this.onMessage("ready", (client, payload: unknown) =>
      this.handleReady(client.sessionId, payload),
    );

    // setOptions isn't a real Colyseus API — instead, options are
    // already what the matchmaker filtered against to create this room
    // in the first place, so filterBy(["code"]) plus client.create(
    // "arena", { code }) is the round trip. Nothing further needed
    // here; this comment is a reminder for future-you.

    console.log(`[arena] room created (code=${code} mapId=${this.mapData.id})`);
  }

  override onJoin(client: Client, _options: unknown): void {
    const archerId = this.allocateArcherId();
    if (archerId === null) {
      // Shouldn't happen — Colyseus enforces maxClients before onJoin —
      // but defensive in case the limit is bumped without updating slots.
      throw new Error(`[arena] no free archer slot for ${client.sessionId}`);
    }
    this.archerIdBySession.set(client.sessionId, archerId);

    // Initialize lobby/match-tracking entries for this session. wins=0
    // until they actually win a round. ready=false until they toggle
    // it themselves.
    this.state.wins.set(client.sessionId, 0);
    this.state.ready.set(client.sessionId, false);

    // Spawn behaviour depends on phase:
    //   - lobby: rebuild the world so the new archer appears with the
    //     others (everyone is at spawn anyway, no disruption).
    //   - playing/round-end: queue the joiner. They watch the in-flight
    //     round; the next rebuildWorld() at round start picks them up.
    //   - match-end: queue too. Lobby reset will rebuild on its own.
    if (this.state.phase === "lobby") {
      this.rebuildWorld();
    } else {
      // Mirror the new wins/ready entries; archers stay as-is.
      this.mirrorState();
    }

    console.log(
      `[arena] joined ${client.sessionId} as ${archerId} ` +
        `(${this.archerIdBySession.size}/${MAX_CLIENTS}, phase=${this.state.phase})`,
    );
  }

  override onLeave(client: Client, _consented: boolean): void {
    const archerId = this.archerIdBySession.get(client.sessionId);
    if (archerId === undefined) return;
    this.archerIdBySession.delete(client.sessionId);
    this.inputs.delete(archerId);
    this.lastClientTickBySession.delete(client.sessionId);

    // Keep the score in state.wins — useful info for the post-match
    // screen even after a player drops. Drop the lobby ready flag
    // (no longer connected → no longer "ready").
    this.state.ready.delete(client.sessionId);

    // Leave behaviour depends on phase:
    //   - lobby: rebuild — keeps the spawn roster tight.
    //   - playing/round-end: forfeit the leaver's archer in place
    //     (alive=false). The remaining archers keep their positions and
    //     in-flight arrows; getRoundOutcome will end the round naturally
    //     if this drops the alive count to <= 1.
    //   - match-end: just mirror — no need to disturb the trophy view.
    if (this.state.phase === "lobby") {
      this.rebuildWorld();
    } else if (this.state.phase === "playing" || this.state.phase === "round-end") {
      this.forfeitArcher(archerId);
    } else {
      this.mirrorState();
    }

    console.log(
      `[arena] left ${client.sessionId} (${archerId}) ` +
        `(${this.archerIdBySession.size}/${MAX_CLIENTS})`,
    );
  }

  override onDispose(): void {
    if (this.ownedCode !== null) {
      releaseRoomCode(this.ownedCode);
      console.log(`[arena] disposed (released code=${this.ownedCode})`);
      this.ownedCode = null;
    }
  }

  handleInput(sessionId: string, payload: unknown): void {
    const archerId = this.archerIdBySession.get(sessionId);
    if (archerId === undefined) return;
    // Inputs are only meaningful while the world is being simulated.
    // Lobby/match-end ignore them silently — the client sends them
    // anyway because the menu screens overlay the same canvas.
    if (this.state.phase !== "playing" && this.state.phase !== "round-end") return;
    this.inputs.set(archerId, validateInput(payload));
    const t = validateClientTick(payload);
    if (t !== null) {
      const prev = this.lastClientTickBySession.get(sessionId) ?? 0;
      if (t > prev) this.lastClientTickBySession.set(sessionId, t);
    }
  }

  handleReset(sessionId: string): void {
    if (!RESET_ALLOWED) return;
    console.log(`[arena] reset requested by ${sessionId}`);
    this.resetToLobby();
  }

  handleReady(sessionId: string, payload: unknown): void {
    if (this.state.phase !== "lobby") return;
    if (!this.state.ready.has(sessionId)) return;
    // Payload is `{ ready: boolean }`; default to toggling the current
    // value if omitted (handy for a single-button UI).
    let nextReady: boolean;
    if (payload !== null && typeof payload === "object") {
      const r = (payload as Record<string, unknown>)["ready"];
      nextReady = typeof r === "boolean" ? r : !this.state.ready.get(sessionId);
    } else {
      nextReady = !this.state.ready.get(sessionId);
    }
    this.state.ready.set(sessionId, nextReady);
    this.maybeStartMatch();
  }

  // Test hooks. Not used in production code.
  getWorldForTest(): World {
    return this.world;
  }
  tickForTest(): void {
    this.simulate(SIMULATION_INTERVAL_MS);
  }
  getOwnedCodeForTest(): string | null {
    return this.ownedCode;
  }
  // Skips the ready handshake and jumps straight to "playing" — used
  // by the older Phase 6/7 tests that predate the lobby flow.
  forceStartMatchForTest(): void {
    this.startMatch();
  }
  // Sets the phase timer to 1 so the next simulate() expires it. Saves
  // tests from ticking 180+ frames just to cross a freeze boundary.
  expireFreezeForTest(): void {
    if (this.state.phase === "round-end" || this.state.phase === "match-end") {
      this.state.phaseTimer = 1;
    }
  }
  // Force a kill on the given archer (alive=false). Used to deterministically
  // end a round in tests without simulating an arrow hit.
  killArcherForTest(archerId: string): void {
    const archer = this.world.archers.get(archerId);
    if (archer === undefined) return;
    const archers = new Map(this.world.archers);
    archers.set(archerId, { ...archer, alive: false });
    this.world = { ...this.world, archers };
  }

  private allocateRoomCode(requested: string | undefined): string {
    if (requested !== undefined) {
      const normalized = normalizeRoomCode(requested);
      if (!isValidRoomCode(normalized)) {
        throw new Error(`[arena] invalid room code "${requested}"`);
      }
      if (!reserveRoomCode(normalized)) {
        throw new Error(`[arena] room code "${normalized}" already in use`);
      }
      return normalized;
    }
    const generated = pickAvailableRoomCode();
    if (generated === null) {
      throw new Error("[arena] failed to pick an available room code (registry saturated?)");
    }
    return generated;
  }

  private allocateArcherId(): string | null {
    const used = new Set(this.archerIdBySession.values());
    for (const id of ARCHER_SLOTS) {
      if (!used.has(id)) return id;
    }
    return null;
  }

  private rebuildWorld(): void {
    this.world = createWorld(this.mapData, this.spawnsPx, [...this.archerIdBySession.values()]);
    this.mirrorState();
  }

  private mirrorState(): void {
    worldToMatchState(
      this.world,
      this.state,
      this.archerIdBySession,
      this.lastClientTickBySession,
    );
  }

  private forfeitArcher(archerId: string): void {
    const archer = this.world.archers.get(archerId);
    if (archer === undefined) return;
    if (!archer.alive) return;
    // World types treat archers as ReadonlyMap, so we rebuild the
    // archers map and swap it in. The engine's stepArcher short-circuits
    // on !alive, so the body just stays where it is until the round
    // ends. (Phase 9 may want a proper "forfeit" event in WorldEvent
    // so the renderer can differentiate from a normal kill.)
    const archers = new Map(this.world.archers);
    archers.set(archerId, { ...archer, alive: false });
    this.world = { ...this.world, archers };
  }

  private maybeStartMatch(): void {
    if (this.state.phase !== "lobby") return;
    if (this.archerIdBySession.size < MIN_PLAYERS_TO_START) return;
    // Every connected session must be ready. We iterate state.ready
    // (kept in sync with the roster in onJoin/onLeave) so a stale
    // sessionId entry can't hold the lobby hostage.
    for (const sessionId of this.archerIdBySession.keys()) {
      if (!this.state.ready.get(sessionId)) return;
    }
    this.startMatch();
  }

  private startMatch(): void {
    // Reset score for everyone currently in the lobby — joiners after
    // this point start at 0 too (handled in onJoin).
    for (const sessionId of this.archerIdBySession.keys()) {
      this.state.wins.set(sessionId, 0);
    }
    this.state.matchWinnerSessionId = "";
    this.state.roundWinnerSessionId = "";
    this.state.roundNumber = 1;
    this.state.phaseTimer = 0;
    this.state.phase = "playing";
    this.rebuildWorld();
    console.log(`[arena] match started (players=${this.archerIdBySession.size})`);
  }

  private startNextRound(): void {
    this.state.roundNumber += 1;
    this.state.roundWinnerSessionId = "";
    this.state.phaseTimer = 0;
    this.state.phase = "playing";
    this.inputs.clear();
    this.rebuildWorld();
  }

  private endRound(winnerSessionId: string | null): void {
    // Increment score before transitioning so the round-end screen sees
    // the updated totals immediately. Draws (winnerSessionId === null)
    // count against everyone — nobody scores.
    if (winnerSessionId !== null) {
      const prev = this.state.wins.get(winnerSessionId) ?? 0;
      this.state.wins.set(winnerSessionId, prev + 1);
    }
    this.state.roundWinnerSessionId = winnerSessionId ?? "";
    this.state.phase = "round-end";
    this.state.phaseTimer = ROUND_END_DELAY_FRAMES;
  }

  private endMatch(matchWinnerSessionId: string): void {
    this.state.matchWinnerSessionId = matchWinnerSessionId;
    this.state.phase = "match-end";
    this.state.phaseTimer = MATCH_END_DELAY_FRAMES;
  }

  private resetToLobby(): void {
    this.state.phase = "lobby";
    this.state.phaseTimer = 0;
    this.state.roundNumber = 0;
    this.state.roundWinnerSessionId = "";
    this.state.matchWinnerSessionId = "";
    this.inputs.clear();
    for (const sessionId of this.archerIdBySession.keys()) {
      this.state.wins.set(sessionId, 0);
      this.state.ready.set(sessionId, false);
    }
    // Keep lastInputTick monotonic across resets — see Phase 7 notes.
    this.rebuildWorld();
  }

  private sessionIdForArcher(archerId: string): string | null {
    for (const [sessionId, slot] of this.archerIdBySession) {
      if (slot === archerId) return sessionId;
    }
    return null;
  }

  private topScorerSessionId(): string {
    let bestSession = "";
    let bestScore = -1;
    for (const [sessionId, wins] of this.state.wins) {
      if (wins > bestScore) {
        bestScore = wins;
        bestSession = sessionId;
      }
    }
    return bestSession;
  }

  private simulate(_dtMs: number): void {
    if (this.state.phase === "lobby" || this.state.phase === "match-end") {
      // No simulation while the menu screens are up — but still tick
      // the timer so match-end auto-returns to lobby.
      if (this.state.phase === "match-end" && this.state.phaseTimer > 0) {
        this.state.phaseTimer -= 1;
        if (this.state.phaseTimer === 0) {
          this.resetToLobby();
        }
      }
      return;
    }

    // Build the input map for this tick. NEUTRAL_INPUT for any archer
    // we haven't received a payload for yet (or whose owner already
    // left — see forfeitArcher).
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

    // Clear edge inputs after the step. Levels persist until the
    // client sends a new input (which it does every frame anyway).
    for (const [id, prev] of this.inputs) {
      if (prev.jump || prev.dodge || prev.shoot) {
        this.inputs.set(id, { ...prev, jump: false, dodge: false, shoot: false });
      }
    }

    // Phase transitions driven by world state.
    if (this.state.phase === "playing") {
      const outcome = getRoundOutcome(this.world);
      if (outcome.kind === "win") {
        const winnerSession = this.sessionIdForArcher(outcome.winnerId);
        this.endRound(winnerSession);
      } else if (outcome.kind === "draw") {
        this.endRound(null);
      }
    } else if (this.state.phase === "round-end") {
      // Keep stepping so the death animation finishes underneath the
      // win text; the world doesn't matter functionally during the
      // freeze, but it stays visually alive.
      if (this.state.phaseTimer > 0) {
        this.state.phaseTimer -= 1;
      }
      if (this.state.phaseTimer === 0) {
        const top = this.topScorerSessionId();
        const topScore = this.state.wins.get(top) ?? 0;
        if (topScore >= this.state.targetWins) {
          this.endMatch(top);
        } else if (this.archerIdBySession.size < MIN_PLAYERS_TO_START) {
          // Everyone except (at most) one player has dropped — the
          // remaining player wins by default. If the room is empty
          // this still works (matchWinnerSessionId="" ⇒ "no winner").
          this.endMatch(this.archerIdBySession.size === 1 ? top : "");
        } else {
          this.startNextRound();
        }
      }
    }

    this.mirrorState();
  }
}

const clampTargetWins = (raw: number | undefined): number => {
  if (raw === undefined || !Number.isFinite(raw) || !Number.isInteger(raw)) {
    return DEFAULT_TARGET_WINS;
  }
  if (raw < 1) return 1;
  if (raw > 9) return 9;
  return raw;
};

import { createWorld, parseMap, stepWorld, type World } from "@arrowfall/engine";
import {
  type ArcherInput,
  type MapJson,
  NEUTRAL_INPUT,
  TILE_SIZE,
} from "@arrowfall/shared";
import { describe, expect, it } from "vitest";
import arena01 from "../maps/arena-01.json" with { type: "json" };
import {
  CORRECTION_DIVERGENCE_PX,
  CORRECTION_LERP_FRAMES,
  PredictionEngine,
} from "./prediction.js";
import { ArcherState, MatchState } from "./schema.js";

const MAP = parseMap(arena01 as MapJson);
const SPAWNS_PX = MAP.spawns.map((s) => ({
  x: s.x * TILE_SIZE,
  y: s.y * TILE_SIZE,
}));

const SESSION = "session-A";
const SLOT = "p1";

// Build a fresh server-side World with our local slot, then mirror it
// onto a MatchState. Used as the seed snapshot for reconcile().
const buildSeed = (): { world: World; state: MatchState } => {
  const world = createWorld(MAP, SPAWNS_PX, [SLOT]);
  const state = mirrorWorldToState(world, SLOT, 0, 0);
  return { world, state };
};

// Hand-rolled subset of worldToMatchState — the test stays inside the
// client package, so we don't pull in @arrowfall/server. We only need
// to wire the fields that PredictionEngine.reconcile reads:
// state.tick, state.archers (keyed by sessionId), state.lastInputTick.
const mirrorWorldToState = (
  world: World,
  slotId: string,
  tick: number,
  ackedClientTick: number,
): MatchState => {
  const state = new MatchState();
  state.tick = tick;
  state.mapId = world.map.id;
  state.lastInputTick.set(SESSION, ackedClientTick);

  const a = world.archers.get(slotId);
  if (a !== undefined) {
    const s = new ArcherState();
    s.id = a.id;
    s.posX = a.pos.x;
    s.posY = a.pos.y;
    s.velX = a.vel.x;
    s.velY = a.vel.y;
    s.facing = a.facing;
    s.state = a.state;
    s.inventory = a.inventory;
    s.alive = a.alive;
    s.deathTimer = a.deathTimer;
    s.spawnIframeTimer = a.spawnIframeTimer;
    s.dodgeIframeTimer = a.dodgeIframeTimer;
    state.archers.set(SESSION, s);
  }
  return state;
};

const RIGHT_INPUT: ArcherInput = {
  ...NEUTRAL_INPUT,
  right: true,
  aimDirection: "E",
};

describe("PredictionEngine — clientTick + pending inputs", () => {
  it("assigns monotonic clientTicks even before a slot is known", () => {
    const pe = new PredictionEngine(MAP, SPAWNS_PX);
    expect(pe.stepLocal(NEUTRAL_INPUT)).toBe(1);
    expect(pe.stepLocal(NEUTRAL_INPUT)).toBe(2);
    expect(pe.stepLocal(NEUTRAL_INPUT)).toBe(3);
    // No slot yet → no pending inputs queued.
    expect(pe.getPendingInputCount()).toBe(0);
  });

  it("queues pending inputs once a slot is set, and stepWorld advances", () => {
    const pe = new PredictionEngine(MAP, SPAWNS_PX);
    const { state } = buildSeed();
    pe.reconcile(state, SESSION);
    expect(pe.getLocalSlotId()).toBe(SLOT);

    pe.stepLocal(RIGHT_INPUT);
    pe.stepLocal(RIGHT_INPUT);
    pe.stepLocal(RIGHT_INPUT);
    expect(pe.getPendingInputCount()).toBe(3);

    // World tick advanced exactly 3 times beyond the seed (tick 0).
    expect(pe.getPredictedWorld().tick).toBe(3);
  });
});

describe("PredictionEngine — reconcile drops acked + replays unacked", () => {
  it("drops pending inputs whose clientTick ≤ acked", () => {
    const pe = new PredictionEngine(MAP, SPAWNS_PX);
    const { state } = buildSeed();
    pe.reconcile(state, SESSION);

    for (let i = 0; i < 5; i++) pe.stepLocal(RIGHT_INPUT);
    expect(pe.getPendingInputCount()).toBe(5);

    // Server acks ticks 1..3. Pending should retain ticks 4..5.
    const { state: acked } = buildSeed();
    acked.lastInputTick.set(SESSION, 3);
    pe.reconcile(acked, SESSION);
    expect(pe.getPendingInputCount()).toBe(2);
  });

  it("predicted == server when the server has acked every input (engine determinism)", () => {
    // Drive a server-side simulation manually and feed its final state
    // back to the prediction engine. With every input acked there's
    // nothing to replay, so the predicted world snaps onto the server's.
    let serverWorld = createWorld(MAP, SPAWNS_PX, [SLOT]);
    const pe = new PredictionEngine(MAP, SPAWNS_PX);
    pe.reconcile(mirrorWorldToState(serverWorld, SLOT, 0, 0), SESSION);

    for (let i = 0; i < 6; i++) {
      pe.stepLocal(RIGHT_INPUT);
      const inputs = new Map<string, ArcherInput>();
      inputs.set(SLOT, RIGHT_INPUT);
      serverWorld = stepWorld(serverWorld, inputs);
    }

    // Predicted advanced 6 ticks; server advanced 6 ticks. The local
    // archer's pos should match exactly (engine is bit-deterministic).
    const pred = pe.getPredictedWorld().archers.get(SLOT)!;
    const truth = serverWorld.archers.get(SLOT)!;
    expect(pred.pos).toEqual(truth.pos);
    expect(pred.vel).toEqual(truth.vel);

    // Now reconcile with everything acked — predicted stays equal.
    pe.reconcile(mirrorWorldToState(serverWorld, SLOT, 6, 6), SESSION);
    expect(pe.getPendingInputCount()).toBe(0);
    const reconciled = pe.getPredictedWorld().archers.get(SLOT)!;
    expect(reconciled.pos).toEqual(truth.pos);
  });

  it("replays unacked inputs when the server is N ticks behind", () => {
    // Server has only acked up to tick 2; client is at tick 6. After
    // reconcile, predicted = server-state-at-2 + replay of inputs 3..6
    // = engine result of 6 right-inputs (same as truth above).
    let serverFinal = createWorld(MAP, SPAWNS_PX, [SLOT]);
    const pe = new PredictionEngine(MAP, SPAWNS_PX);
    pe.reconcile(mirrorWorldToState(serverFinal, SLOT, 0, 0), SESSION);

    for (let i = 0; i < 6; i++) {
      pe.stepLocal(RIGHT_INPUT);
      const inputs = new Map<string, ArcherInput>();
      inputs.set(SLOT, RIGHT_INPUT);
      serverFinal = stepWorld(serverFinal, inputs);
    }

    // Server view: had only got through tick 2 by the time it sent us
    // a snapshot. We rebuild it by stepping the seed twice.
    let serverBehind = createWorld(MAP, SPAWNS_PX, [SLOT]);
    for (let i = 0; i < 2; i++) {
      const inputs = new Map<string, ArcherInput>();
      inputs.set(SLOT, RIGHT_INPUT);
      serverBehind = stepWorld(serverBehind, inputs);
    }

    pe.reconcile(mirrorWorldToState(serverBehind, SLOT, 2, 2), SESSION);

    // 4 inputs (ticks 3..6) replayed; predicted should match the truth
    // we computed by stepping forward all 6 ticks.
    expect(pe.getPendingInputCount()).toBe(4);
    const pred = pe.getPredictedWorld().archers.get(SLOT)!;
    const truth = serverFinal.archers.get(SLOT)!;
    expect(pred.pos).toEqual(truth.pos);
  });
});

describe("PredictionEngine — correction lerp on divergence", () => {
  it("does not arm a correction when predicted matches server (zero divergence)", () => {
    const pe = new PredictionEngine(MAP, SPAWNS_PX);
    const { state } = buildSeed();
    pe.reconcile(state, SESSION);

    // Step locally and step the server in lockstep — both are
    // deterministic from the same seed.
    pe.stepLocal(RIGHT_INPUT);
    let serverWorld = createWorld(MAP, SPAWNS_PX, [SLOT]);
    const serverInputs = new Map<string, ArcherInput>();
    serverInputs.set(SLOT, RIGHT_INPUT);
    serverWorld = stepWorld(serverWorld, serverInputs);

    pe.reconcile(mirrorWorldToState(serverWorld, SLOT, 1, 1), SESSION);
    expect(pe.getRenderCorrection()).toEqual({ x: 0, y: 0 });
  });

  it("arms a correction when divergence > threshold and decays it linearly", () => {
    const pe = new PredictionEngine(MAP, SPAWNS_PX);
    const { state } = buildSeed();
    pe.reconcile(state, SESSION);

    // Walk 5 frames right (predicted moves a few pixels).
    for (let i = 0; i < 5; i++) pe.stepLocal(RIGHT_INPUT);
    const beforePos = pe.getPredictedWorld().archers.get(SLOT)!.pos;

    // Server claims we ended up 20 px to the LEFT of where we are
    // (anti-cheat / rubber-band scenario). All client inputs acked.
    const serverWorld = createWorld(MAP, SPAWNS_PX, [SLOT]);
    const a = serverWorld.archers.get(SLOT)!;
    const teleported: World = {
      ...serverWorld,
      archers: new Map([
        [
          SLOT,
          { ...a, pos: { x: beforePos.x - 20, y: beforePos.y } },
        ],
      ]),
    };
    pe.reconcile(mirrorWorldToState(teleported, SLOT, 5, 5), SESSION);

    // Offset = previous - new = (20, 0) — the renderer adds this so
    // the visual stays at the *old* spot for one frame, then lerps
    // back to (0,0) over CORRECTION_LERP_FRAMES ticks.
    const c0 = pe.getRenderCorrection();
    expect(c0.x).toBeGreaterThan(CORRECTION_DIVERGENCE_PX);
    expect(c0.y).toBe(0);

    // Decay one frame at a time via further stepLocal calls.
    pe.stepLocal(NEUTRAL_INPUT);
    const c1 = pe.getRenderCorrection();
    expect(c1.x).toBeLessThan(c0.x);

    for (let i = 0; i < CORRECTION_LERP_FRAMES; i++) pe.stepLocal(NEUTRAL_INPUT);
    expect(pe.getRenderCorrection()).toEqual({ x: 0, y: 0 });
  });
});

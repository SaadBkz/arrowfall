import { describe, expect, it } from "vitest";
import {
  INTERPOLATION_BUFFER_SIZE,
  INTERPOLATION_DELAY_TICKS,
  RemoteInterpolator,
  interpolateBuffer,
} from "./interpolation.js";
import { ArcherState, MatchState } from "./schema.js";

// Snapshot factory matching the buffer's ArcherSnapshot shape (which
// is internal — we synthesize via ArcherState since interpolateBuffer
// works directly on the buffer entries built by RemoteInterpolator).
const snap = (slotId: string, posX: number, posY: number) => ({
  slotId,
  posX,
  posY,
  velX: 0,
  velY: 0,
  facing: "R",
  state: "idle",
  inventory: 3,
  alive: true,
  deathTimer: 0,
  spawnIframeTimer: 0,
  dodgeIframeTimer: 0,
});

describe("interpolateBuffer", () => {
  it("returns null for an empty buffer", () => {
    expect(interpolateBuffer([], 10)).toBeNull();
  });

  it("returns the only entry for a singleton buffer (cold-start fallback)", () => {
    const only = { serverTick: 5, archer: snap("p2", 100, 50) };
    expect(interpolateBuffer([only], 7)).toBe(only.archer);
  });

  it("returns the oldest entry when target is before it", () => {
    const buf = [
      { serverTick: 10, archer: snap("p2", 0, 0) },
      { serverTick: 20, archer: snap("p2", 100, 0) },
    ];
    // target=5 → before oldest=10 → fallback to oldest.
    expect(interpolateBuffer(buf, 5)).toBe(buf[0]!.archer);
  });

  it("returns the newest entry when target is past it", () => {
    const buf = [
      { serverTick: 10, archer: snap("p2", 0, 0) },
      { serverTick: 20, archer: snap("p2", 100, 0) },
    ];
    expect(interpolateBuffer(buf, 30)).toBe(buf[1]!.archer);
  });

  it("lerps positions linearly between two bracketing snapshots", () => {
    const buf = [
      { serverTick: 10, archer: snap("p2", 0, 0) },
      { serverTick: 20, archer: snap("p2", 100, 50) },
    ];
    const r = interpolateBuffer(buf, 15)!;
    // halfway: pos = (50, 25)
    expect(r.posX).toBe(50);
    expect(r.posY).toBe(25);
  });

  it("lerps inside a 3-snapshot buffer (picks the right pair)", () => {
    const buf = [
      { serverTick: 10, archer: snap("p2", 0, 0) },
      { serverTick: 20, archer: snap("p2", 100, 0) },
      { serverTick: 30, archer: snap("p2", 200, 0) },
    ];
    // target=25 is between 20 and 30 → midway = 150
    expect(interpolateBuffer(buf, 25)!.posX).toBe(150);
  });
});

describe("RemoteInterpolator buffer behaviour", () => {
  // Build a MatchState manually with two archers (one local, one
  // remote). We're not testing schema serialization — just that the
  // interpolator slices the right rows out and key by sessionId.
  const buildState = (
    tick: number,
    rows: ReadonlyArray<{ session: string; slotId: string; x: number; y: number }>,
  ): MatchState => {
    const state = new MatchState();
    state.tick = tick;
    state.mapId = "arena-01";
    for (const row of rows) {
      const a = new ArcherState();
      a.id = row.slotId;
      a.posX = row.x;
      a.posY = row.y;
      state.archers.set(row.session, a);
    }
    return state;
  };

  it("excludes the local sessionId from the buffer", () => {
    const ri = new RemoteInterpolator();
    const state = buildState(10, [
      { session: "me", slotId: "p1", x: 0, y: 0 },
      { session: "you", slotId: "p2", x: 100, y: 0 },
    ]);
    ri.ingest(state, "me");
    expect(ri.archerAt("me")).toBeNull();
    expect(ri.archerAt("you")).not.toBeNull();
  });

  it("getRenderTargetTick subtracts INTERPOLATION_DELAY_TICKS from latest", () => {
    const ri = new RemoteInterpolator();
    ri.ingest(buildState(50, [{ session: "you", slotId: "p2", x: 0, y: 0 }]), "me");
    expect(ri.getRenderTargetTick()).toBe(50 - INTERPOLATION_DELAY_TICKS);
  });

  it("clamps render-target tick at 0 during the first ticks", () => {
    const ri = new RemoteInterpolator();
    ri.ingest(buildState(1, [{ session: "you", slotId: "p2", x: 0, y: 0 }]), "me");
    expect(ri.getRenderTargetTick()).toBe(0);
  });

  it("isColdStart is true with < 2 snapshots, false with ≥ 2", () => {
    const ri = new RemoteInterpolator();
    expect(ri.isColdStart("you")).toBe(true);
    ri.ingest(buildState(10, [{ session: "you", slotId: "p2", x: 0, y: 0 }]), "me");
    expect(ri.isColdStart("you")).toBe(true);
    ri.ingest(buildState(11, [{ session: "you", slotId: "p2", x: 1, y: 0 }]), "me");
    expect(ri.isColdStart("you")).toBe(false);
  });

  it("evicts the oldest entry when more than BUFFER_SIZE snapshots are pushed", () => {
    const ri = new RemoteInterpolator();
    // Push BUFFER_SIZE + 3 distinct ticks.
    for (let t = 1; t <= INTERPOLATION_BUFFER_SIZE + 3; t++) {
      ri.ingest(buildState(t, [{ session: "you", slotId: "p2", x: t, y: 0 }]), "me");
    }
    // Latest ingested tick = BUFFER_SIZE + 3. Render target lags by 2.
    // Expected ring contents: ticks (4..BUFFER_SIZE+3). Sampling at the
    // oldest in the buffer should never return a tick < 4.
    const target = ri.getRenderTargetTick();
    expect(target).toBe(INTERPOLATION_BUFFER_SIZE + 3 - INTERPOLATION_DELAY_TICKS);
    // Buffer holds the 5 most recent → oldest serverTick is 4.
    // Asking for tick 3 (before oldest) should return that oldest's pos = 4.
    const r = ri.archerAt("you");
    // This sanity-checks via posX, which encodes serverTick in our test.
    expect(r).not.toBeNull();
    // At target=BUFFER_SIZE+1 we lerp between (BUFFER_SIZE, BUFFER_SIZE+1)
    // exactly — the result equals tick BUFFER_SIZE+1's posX.
    expect(r!.posX).toBe(target);
  });

  it("drops a sessionId's buffer when the session leaves the room", () => {
    const ri = new RemoteInterpolator();
    ri.ingest(buildState(10, [{ session: "you", slotId: "p2", x: 0, y: 0 }]), "me");
    ri.ingest(buildState(11, [{ session: "you", slotId: "p2", x: 1, y: 0 }]), "me");
    expect(ri.archerAt("you")).not.toBeNull();

    // Next snapshot omits "you" — the room reaper has removed the row.
    ri.ingest(buildState(12, []), "me");
    expect(ri.archerAt("you")).toBeNull();
  });
});

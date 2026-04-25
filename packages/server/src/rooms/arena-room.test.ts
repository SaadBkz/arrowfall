import { afterEach, describe, expect, it } from "vitest";
import { type Client } from "colyseus";
import { type ArcherInput, NEUTRAL_INPUT } from "@arrowfall/shared";
import { ArenaRoom } from "./arena-room.js";

// Minimal Client mock — onJoin / onLeave only read sessionId. Cast
// as `Client` because the full interface has dozens of fields we
// don't need here.
const fakeClient = (sessionId: string): Client => ({ sessionId }) as unknown as Client;

// Boot a Room with our framework setup steps. Colyseus's Clock is
// paused by default (the framework calls clock.start() during
// listen()), so setSimulationInterval / setPatchRate are registered
// but never fire. We tick manually via room.tickForTest().
const newRoom = (): ArenaRoom => {
  const room = new ArenaRoom();
  room.onCreate({});
  return room;
};

// Track rooms per test so we can disconnect them and free the clock.
const rooms: ArenaRoom[] = [];

afterEach(async () => {
  while (rooms.length > 0) {
    const room = rooms.pop()!;
    try {
      await room.disconnect();
    } catch {
      // ignore — some rooms aren't fully wired in tests
    }
  }
});

const setup = (): ArenaRoom => {
  const r = newRoom();
  rooms.push(r);
  return r;
};

describe("ArenaRoom", () => {
  it("onJoin assigns p1 to the first session and adds an archer to the world", () => {
    const room = setup();
    const c1 = fakeClient("session-1");
    room.onJoin(c1, {});

    const world = room.getWorldForTest();
    expect(world.archers.size).toBe(1);
    expect(world.archers.has("p1")).toBe(true);
  });

  it("onJoin allocates p1, p2, p3 in arrival order", () => {
    const room = setup();
    room.onJoin(fakeClient("a"), {});
    room.onJoin(fakeClient("b"), {});
    room.onJoin(fakeClient("c"), {});
    const world = room.getWorldForTest();
    expect([...world.archers.keys()].sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("onLeave removes the archer from the world and frees the slot", () => {
    const room = setup();
    room.onJoin(fakeClient("a"), {});
    room.onJoin(fakeClient("b"), {});
    room.onLeave(fakeClient("a"), false);

    const world = room.getWorldForTest();
    expect(world.archers.size).toBe(1);
    expect(world.archers.has("p2")).toBe(true);

    // p1 slot is reusable for the next joiner.
    room.onJoin(fakeClient("c"), {});
    const after = room.getWorldForTest();
    expect([...after.archers.keys()].sort()).toEqual(["p1", "p2"]);
  });

  it("buffered input moves the archer when simulate runs", () => {
    const room = setup();
    room.onJoin(fakeClient("a"), {});
    const startX = room.getWorldForTest().archers.get("p1")!.pos.x;

    const right: ArcherInput = { ...NEUTRAL_INPUT, right: true };
    room.handleInput("a", right);

    // Run several ticks. Walking accelerates from 0, so a few are
    // needed before the position visibly increases.
    for (let i = 0; i < 10; i++) {
      // Re-buffer because the room clears edges (not levels) every tick;
      // levels persist, but we re-send to mimic the client's per-frame
      // input loop and prove the pipe is plumbed end-to-end.
      room.handleInput("a", right);
      room.tickForTest();
    }

    const endX = room.getWorldForTest().archers.get("p1")!.pos.x;
    expect(endX).toBeGreaterThan(startX);
  });

  it("malformed input payloads are silently neutralized (no archer movement)", () => {
    const room = setup();
    room.onJoin(fakeClient("a"), {});
    const startX = room.getWorldForTest().archers.get("p1")!.pos.x;

    // Garbage payload — should be coerced to NEUTRAL_INPUT.
    room.handleInput("a", { totally: "wrong shape" });
    for (let i = 0; i < 30; i++) room.tickForTest();

    const endX = room.getWorldForTest().archers.get("p1")!.pos.x;
    expect(endX).toBe(startX);
  });

  it("input from an unknown sessionId is ignored", () => {
    const room = setup();
    // No join — this sessionId has no slot.
    expect(() =>
      room.handleInput("ghost", { ...NEUTRAL_INPUT, right: true }),
    ).not.toThrow();
    expect(room.getWorldForTest().archers.size).toBe(0);
  });

  it("MatchState mirrors archers keyed by sessionId after onJoin", () => {
    const room = setup();
    room.onJoin(fakeClient("session-1"), {});
    expect(room.state.archers.size).toBe(1);
    // Schema is keyed by sessionId so a connected client can find
    // itself with `state.archers.get(room.sessionId)`.
    expect(room.state.archers.has("session-1")).toBe(true);
    // The slot id (p1..p6) lives inside ArcherState.id for HUD/role mapping.
    expect(room.state.archers.get("session-1")!.id).toBe("p1");
  });

  it("simulate increments tick on each call", () => {
    const room = setup();
    room.onJoin(fakeClient("a"), {});
    const t0 = room.state.tick;
    room.tickForTest();
    expect(room.state.tick).toBe(t0 + 1);
    room.tickForTest();
    expect(room.state.tick).toBe(t0 + 2);
  });
});

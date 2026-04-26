import { afterEach, describe, expect, it } from "vitest";
import { type Client } from "colyseus";
import { ArenaRoom } from "./arena-room.js";
import {
  _resetRoomCodesForTest,
  isRoomCodeReserved,
  isValidRoomCode,
} from "./room-codes.js";

// Phase 8 — lobby + round/match flow tests. Distinct from arena-room.test.ts
// (which keeps the Phase 6/7 input/sync tests) so the two concerns
// stay legible. Same Clock-paused setup: we simulate by hand via
// tickForTest / expireFreezeForTest.

const fakeClient = (sessionId: string): Client => ({ sessionId }) as unknown as Client;

const rooms: ArenaRoom[] = [];

afterEach(async () => {
  while (rooms.length > 0) {
    const room = rooms.pop()!;
    try {
      await room.disconnect();
    } catch {
      // ignore
    }
  }
  _resetRoomCodesForTest();
});

const newRoom = (options: { code?: string; targetWins?: number } = {}): ArenaRoom => {
  const r = new ArenaRoom();
  r.onCreate(options);
  rooms.push(r);
  return r;
};

const readyAll = (room: ArenaRoom, sessionIds: ReadonlyArray<string>): void => {
  for (const id of sessionIds) {
    room.handleReady(id, { ready: true });
  }
};

describe("ArenaRoom — code allocation", () => {
  it("auto-generates a valid 4-letter code when none is supplied", () => {
    const room = newRoom();
    const code = room.state.roomCode;
    expect(isValidRoomCode(code)).toBe(true);
    expect(isRoomCodeReserved(code)).toBe(true);
  });

  it("uses the provided code (normalized) and reserves it", () => {
    const room = newRoom({ code: " abcd " });
    expect(room.state.roomCode).toBe("ABCD");
    expect(isRoomCodeReserved("ABCD")).toBe(true);
  });

  it("rejects an invalid code at create time", () => {
    expect(() => newRoom({ code: "AB12" })).toThrow();
  });

  it("rejects a duplicate code", () => {
    newRoom({ code: "WXYZ" });
    expect(() => newRoom({ code: "WXYZ" })).toThrow();
  });
});

describe("ArenaRoom — lobby readiness", () => {
  it("starts in 'lobby' phase with roundNumber=0 and no winner set", () => {
    const room = newRoom();
    expect(room.state.phase).toBe("lobby");
    expect(room.state.roundNumber).toBe(0);
    expect(room.state.matchWinnerSessionId).toBe("");
    expect(room.state.roundWinnerSessionId).toBe("");
  });

  it("seeds wins=0 and ready=false for each joiner", () => {
    const room = newRoom();
    room.onJoin(fakeClient("a"), {});
    expect(room.state.wins.get("a")).toBe(0);
    expect(room.state.ready.get("a")).toBe(false);
  });

  it("does NOT start the match when only one player is ready", () => {
    const room = newRoom();
    room.onJoin(fakeClient("a"), {});
    room.handleReady("a", { ready: true });
    expect(room.state.phase).toBe("lobby");
  });

  it("does NOT start the match when one of two players is unready", () => {
    const room = newRoom();
    room.onJoin(fakeClient("a"), {});
    room.onJoin(fakeClient("b"), {});
    room.handleReady("a", { ready: true });
    expect(room.state.phase).toBe("lobby");
  });

  it("starts the match once both players have toggled ready", () => {
    const room = newRoom();
    room.onJoin(fakeClient("a"), {});
    room.onJoin(fakeClient("b"), {});
    readyAll(room, ["a", "b"]);
    expect(room.state.phase).toBe("playing");
    expect(room.state.roundNumber).toBe(1);
  });

  it("toggles ready in place when payload is omitted", () => {
    const room = newRoom();
    room.onJoin(fakeClient("a"), {});
    room.handleReady("a", null);
    expect(room.state.ready.get("a")).toBe(true);
    room.handleReady("a", null);
    expect(room.state.ready.get("a")).toBe(false);
  });

  it("ignores ready messages while not in lobby", () => {
    const room = newRoom();
    room.onJoin(fakeClient("a"), {});
    room.onJoin(fakeClient("b"), {});
    readyAll(room, ["a", "b"]);
    // We're now in 'playing'; ready toggles are no-ops.
    room.handleReady("a", { ready: false });
    expect(room.state.phase).toBe("playing");
  });
});

describe("ArenaRoom — round resolution", () => {
  it("transitions playing → round-end when only one archer survives", () => {
    const room = newRoom();
    room.onJoin(fakeClient("a"), {});
    room.onJoin(fakeClient("b"), {});
    readyAll(room, ["a", "b"]);
    // Kill p2; p1 survives → round won by session 'a'.
    room.killArcherForTest("p2");
    room.tickForTest();
    expect(room.state.phase).toBe("round-end");
    expect(room.state.roundWinnerSessionId).toBe("a");
    expect(room.state.wins.get("a")).toBe(1);
    expect(room.state.wins.get("b")).toBe(0);
  });

  it("transitions to round-end with no winner on a draw", () => {
    const room = newRoom();
    room.onJoin(fakeClient("a"), {});
    room.onJoin(fakeClient("b"), {});
    readyAll(room, ["a", "b"]);
    room.killArcherForTest("p1");
    room.killArcherForTest("p2");
    room.tickForTest();
    expect(room.state.phase).toBe("round-end");
    expect(room.state.roundWinnerSessionId).toBe("");
    expect(room.state.wins.get("a")).toBe(0);
    expect(room.state.wins.get("b")).toBe(0);
  });

  it("starts the next round once the round-end freeze elapses", () => {
    const room = newRoom();
    room.onJoin(fakeClient("a"), {});
    room.onJoin(fakeClient("b"), {});
    readyAll(room, ["a", "b"]);
    room.killArcherForTest("p2");
    room.tickForTest();
    const startRound = room.state.roundNumber;
    expect(room.state.phase).toBe("round-end");
    room.expireFreezeForTest();
    room.tickForTest();
    expect(room.state.phase).toBe("playing");
    expect(room.state.roundNumber).toBe(startRound + 1);
    // Both archers respawn in the new world.
    expect(room.getWorldForTest().archers.size).toBe(2);
  });
});

describe("ArenaRoom — match resolution", () => {
  it("ends the match once a player hits targetWins", () => {
    const room = newRoom({ targetWins: 2 });
    room.onJoin(fakeClient("a"), {});
    room.onJoin(fakeClient("b"), {});
    readyAll(room, ["a", "b"]);

    // Win round 1 for 'a'.
    room.killArcherForTest("p2");
    room.tickForTest();
    room.expireFreezeForTest();
    room.tickForTest();
    expect(room.state.wins.get("a")).toBe(1);
    expect(room.state.phase).toBe("playing");

    // Win round 2 for 'a' → match-end (target=2).
    room.killArcherForTest("p2");
    room.tickForTest();
    room.expireFreezeForTest();
    room.tickForTest();
    expect(room.state.phase).toBe("match-end");
    expect(room.state.matchWinnerSessionId).toBe("a");
    expect(room.state.wins.get("a")).toBe(2);
  });

  it("returns to lobby after match-end freeze, resetting wins/ready", () => {
    const room = newRoom({ targetWins: 1 });
    room.onJoin(fakeClient("a"), {});
    room.onJoin(fakeClient("b"), {});
    readyAll(room, ["a", "b"]);

    room.killArcherForTest("p2");
    room.tickForTest();
    room.expireFreezeForTest();
    room.tickForTest();
    expect(room.state.phase).toBe("match-end");

    room.expireFreezeForTest();
    room.tickForTest();
    expect(room.state.phase).toBe("lobby");
    expect(room.state.wins.get("a")).toBe(0);
    expect(room.state.wins.get("b")).toBe(0);
    expect(room.state.ready.get("a")).toBe(false);
    expect(room.state.ready.get("b")).toBe(false);
  });

  it("clamps targetWins to [1, 9]", () => {
    expect(newRoom({ targetWins: 0 }).state.targetWins).toBe(1);
    expect(newRoom({ targetWins: 99 }).state.targetWins).toBe(9);
    expect(newRoom({ targetWins: 4 }).state.targetWins).toBe(4);
  });
});

describe("ArenaRoom — mid-round join/leave", () => {
  it("queues a joiner who arrives during a round (not present until next round)", () => {
    const room = newRoom();
    room.onJoin(fakeClient("a"), {});
    room.onJoin(fakeClient("b"), {});
    readyAll(room, ["a", "b"]);
    expect(room.state.phase).toBe("playing");

    // Mid-round: c joins. World should still hold only p1 + p2 — the
    // mirror tracks the world, so state.archers stays at 2 too. c is
    // present in state.wins/ready (the menu uses those for the roster
    // when a player is queued for the next round).
    room.onJoin(fakeClient("c"), {});
    expect(room.getWorldForTest().archers.size).toBe(2);
    expect(room.state.archers.size).toBe(2);
    expect(room.state.wins.has("c")).toBe(true);

    // End the current round → next round picks up c as p3.
    room.killArcherForTest("p2");
    room.tickForTest();
    room.expireFreezeForTest();
    room.tickForTest();
    expect(room.getWorldForTest().archers.size).toBe(3);
    expect(room.getWorldForTest().archers.has("p3")).toBe(true);
  });

  it("forfeits a leaver mid-round (alive=false) and ends the round if 1 alive remains", () => {
    const room = newRoom();
    room.onJoin(fakeClient("a"), {});
    room.onJoin(fakeClient("b"), {});
    readyAll(room, ["a", "b"]);

    // 'a' leaves in the middle of the round → p1 is forfeited.
    room.onLeave(fakeClient("a"), false);
    expect(room.getWorldForTest().archers.get("p1")?.alive).toBe(false);

    // Tick once → getRoundOutcome sees 1 alive → round-end with 'b' winning.
    room.tickForTest();
    expect(room.state.phase).toBe("round-end");
    expect(room.state.roundWinnerSessionId).toBe("b");
    expect(room.state.wins.get("b")).toBe(1);
  });

  it("keeps the remaining player's score across a forfeit", () => {
    const room = newRoom({ targetWins: 1 });
    room.onJoin(fakeClient("a"), {});
    room.onJoin(fakeClient("b"), {});
    readyAll(room, ["a", "b"]);

    // 'a' leaves → 'b' wins this round and then the match (target=1).
    room.onLeave(fakeClient("a"), false);
    room.tickForTest();
    expect(room.state.phase).toBe("round-end");
    room.expireFreezeForTest();
    room.tickForTest();
    expect(room.state.phase).toBe("match-end");
    expect(room.state.matchWinnerSessionId).toBe("b");
  });
});

import { describe, expect, it } from "vitest";
import { isMatchPhase, MatchState } from "./schema.js";

describe("isMatchPhase", () => {
  it("recognizes the four canonical phases", () => {
    expect(isMatchPhase("lobby")).toBe(true);
    expect(isMatchPhase("playing")).toBe(true);
    expect(isMatchPhase("round-end")).toBe(true);
    expect(isMatchPhase("match-end")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isMatchPhase("")).toBe(false);
    expect(isMatchPhase("LOBBY")).toBe(false);
    expect(isMatchPhase("playing ")).toBe(false);
    expect(isMatchPhase("game")).toBe(false);
  });
});

describe("MatchState defaults", () => {
  it("constructs with sensible Phase 8 defaults", () => {
    const s = new MatchState();
    expect(s.phase).toBe("lobby");
    expect(s.roomCode).toBe("");
    expect(s.roundNumber).toBe(0);
    expect(s.targetWins).toBe(3);
    expect(s.phaseTimer).toBe(0);
    expect(s.matchWinnerSessionId).toBe("");
    expect(s.roundWinnerSessionId).toBe("");
    expect(s.wins.size).toBe(0);
    expect(s.ready.size).toBe(0);
  });

  it("Phase 9a — chests array starts empty", () => {
    const s = new MatchState();
    expect(s.chests).toBeDefined();
    expect(s.chests.length).toBe(0);
  });
});

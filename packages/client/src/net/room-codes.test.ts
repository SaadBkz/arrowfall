import { describe, expect, it } from "vitest";
import {
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from "./room-codes.js";

describe("normalizeRoomCode", () => {
  it("uppercases and trims user input", () => {
    expect(normalizeRoomCode("  abcd  ")).toBe("ABCD");
    expect(normalizeRoomCode("AbCd")).toBe("ABCD");
  });
});

describe("isValidRoomCode", () => {
  it("accepts a 4-letter code from the alphabet", () => {
    expect(isValidRoomCode("ABCD")).toBe(true);
    expect(isValidRoomCode("ZYXW")).toBe(true);
  });

  it("rejects ambiguous letters I and O (excluded from alphabet)", () => {
    expect(isValidRoomCode("ABCI")).toBe(false);
    expect(isValidRoomCode("ABCO")).toBe(false);
  });

  it("rejects digits, lowercase, wrong length", () => {
    expect(isValidRoomCode("AB12")).toBe(false);
    expect(isValidRoomCode("abcd")).toBe(false);
    expect(isValidRoomCode("ABCDE")).toBe(false);
    expect(isValidRoomCode("ABC")).toBe(false);
    expect(isValidRoomCode("")).toBe(false);
  });
});

describe("generateRoomCode", () => {
  it("returns a code that passes isValidRoomCode", () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      expect(isValidRoomCode(code)).toBe(true);
      for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    }
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  _resetRoomCodesForTest,
  isRoomCodeReserved,
  isValidRoomCode,
  normalizeRoomCode,
  pickAvailableRoomCode,
  releaseRoomCode,
  reserveRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
} from "./room-codes.js";

afterEach(() => {
  _resetRoomCodesForTest();
});

describe("normalizeRoomCode", () => {
  it("uppercases and trims input", () => {
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

describe("reserveRoomCode / releaseRoomCode", () => {
  it("reserves a valid code, then refuses a duplicate", () => {
    expect(reserveRoomCode("ABCD")).toBe(true);
    expect(reserveRoomCode("ABCD")).toBe(false);
    expect(isRoomCodeReserved("ABCD")).toBe(true);
  });

  it("releases a code so it becomes reservable again", () => {
    reserveRoomCode("ABCD");
    releaseRoomCode("ABCD");
    expect(isRoomCodeReserved("ABCD")).toBe(false);
    expect(reserveRoomCode("ABCD")).toBe(true);
  });

  it("refuses an invalid code (does not pollute the registry)", () => {
    expect(reserveRoomCode("AB12")).toBe(false);
    expect(isRoomCodeReserved("AB12")).toBe(false);
  });
});

describe("pickAvailableRoomCode", () => {
  it("returns a valid code drawn from the alphabet", () => {
    const code = pickAvailableRoomCode();
    expect(code).not.toBeNull();
    expect(isValidRoomCode(code!)).toBe(true);
    expect(code!).toHaveLength(ROOM_CODE_LENGTH);
    for (const ch of code!) expect(ROOM_CODE_ALPHABET).toContain(ch);
  });

  it("each picked code is reserved (never returns the same one back-to-back)", () => {
    const a = pickAvailableRoomCode()!;
    const b = pickAvailableRoomCode()!;
    expect(isRoomCodeReserved(a)).toBe(true);
    expect(isRoomCodeReserved(b)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("returns null when every attempt collides", () => {
    // Pin Math.random to a constant so every attempt produces the same
    // code, then reserve that code so all maxAttempts collide.
    const realRandom = Math.random;
    try {
      Math.random = () => 0;
      const firstChar = ROOM_CODE_ALPHABET[0]!;
      const fixedCode = firstChar.repeat(ROOM_CODE_LENGTH);
      reserveRoomCode(fixedCode);
      expect(pickAvailableRoomCode(5)).toBeNull();
    } finally {
      Math.random = realRandom;
    }
  });
});

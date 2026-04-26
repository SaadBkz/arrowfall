// 4-letter room codes for Phase 8 lobby.
//
// Alphabet excludes I and O — they read as 1 / 0 on a phone screenshot
// and players type the wrong character. 24^4 = 331,776 combinations is
// way more than the few dozen concurrent rooms a hobby Fly.io instance
// will ever host, so collisions stay statistically rare.
//
// The registry is a process-local Set. Single Fly.io node = single
// shared registry; if we ever scale horizontally we'll need Redis (or
// Colyseus presence) keyed on the code — out of scope for the MVP.

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 4;

const codeRegex = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

// Live reservations. Each ArenaRoom calls reserveRoomCode in onCreate and
// releaseRoomCode in onDispose, so a room's code is freed when the last
// client leaves and Colyseus disposes the room.
const reservedCodes = new Set<string>();

// Trim + uppercase. Players may type "abcd" or " Abcd " — accept both
// without making them re-key. Returns the canonical form, even if the
// result is invalid (validation is done separately by isValidRoomCode).
export const normalizeRoomCode = (raw: string): string => raw.trim().toUpperCase();

export const isValidRoomCode = (code: string): boolean => codeRegex.test(code);

// Best-effort code generation. Tries up to `maxAttempts` random codes
// before giving up — at 24^4 combinations a registry would need to
// hold ~hundreds of thousands of rooms before this becomes flaky, which
// no MVP deployment will hit.
const DEFAULT_MAX_ATTEMPTS = 10;

const randomCode = (): string => {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    const idx = Math.floor(Math.random() * CODE_ALPHABET.length);
    out += CODE_ALPHABET[idx];
  }
  return out;
};

// Reserve a unique code in one step. Returns the code or null if all
// attempts collided (treated as a 503 by the caller). Caller MUST
// release the code when the room is disposed.
export const pickAvailableRoomCode = (
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
): string | null => {
  for (let i = 0; i < maxAttempts; i++) {
    const code = randomCode();
    if (!reservedCodes.has(code)) {
      reservedCodes.add(code);
      return code;
    }
  }
  return null;
};

// Reserve a caller-provided code (used when the client supplies a code
// in create options — typically the host generated it locally so the
// matchmaker filterBy can route join requests to the same room).
// Returns true on success, false if the code is already taken.
export const reserveRoomCode = (code: string): boolean => {
  if (!isValidRoomCode(code)) return false;
  if (reservedCodes.has(code)) return false;
  reservedCodes.add(code);
  return true;
};

export const releaseRoomCode = (code: string): void => {
  reservedCodes.delete(code);
};

export const isRoomCodeReserved = (code: string): boolean => reservedCodes.has(code);

// Test helper — never call from production code. Prevents one test
// leaking reservations into the next when they share the module.
export const _resetRoomCodesForTest = (): void => {
  reservedCodes.clear();
};

export const ROOM_CODE_LENGTH = CODE_LENGTH;
export const ROOM_CODE_ALPHABET = CODE_ALPHABET;

// Client-side mirror of the server's room-code rules. We keep two
// copies (instead of importing from the server package) for the same
// reason match-state lives in both: zero cross-package coupling
// between client and server source trees, just shared wire contracts.
//
// Alphabet, length and validation MUST stay in lockstep with
// `packages/server/src/rooms/room-codes.ts`. If you bump the alphabet,
// fix both files (and update the test in either tree).

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_LENGTH = 4;
const codeRegex = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

export const ROOM_CODE_LENGTH = CODE_LENGTH;
export const ROOM_CODE_ALPHABET = CODE_ALPHABET;

export const normalizeRoomCode = (raw: string): string => raw.trim().toUpperCase();
export const isValidRoomCode = (code: string): boolean => codeRegex.test(code);

// Generate a fresh code locally. The host sends this to the server in
// the create options; on collision (very rare — 24^4 = 331,776) the
// server throws and the caller can retry with a new code.
export const generateRoomCode = (): string => {
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    const idx = Math.floor(Math.random() * CODE_ALPHABET.length);
    out += CODE_ALPHABET[idx];
  }
  return out;
};

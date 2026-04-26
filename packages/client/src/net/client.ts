import { Client, type Room } from "colyseus.js";
import { generateRoomCode, normalizeRoomCode } from "./room-codes.js";
import type { MatchState } from "./schema.js";

// URL precedence:
//   1. VITE_COLYSEUS_URL (set in `.env`, `.env.local` or shell env at
//      build/dev time) — wins everywhere. Useful to point dev at the Fly
//      server, or to test against a staging deploy.
//   2. import.meta.env.PROD = the deployed Vercel build → Fly URL.
//   3. dev fallback = ws://localhost:2567 (matches server `pnpm dev`).
const PROD_DEFAULT_URL = "wss://arrowfall-server.fly.dev";
const DEV_DEFAULT_URL = "ws://localhost:2567";

export const colyseusUrl = (): string => {
  const override = import.meta.env["VITE_COLYSEUS_URL"];
  if (typeof override === "string" && override.length > 0) return override;
  return import.meta.env.PROD ? PROD_DEFAULT_URL : DEV_DEFAULT_URL;
};

// One singleton Client per page. Colyseus.js manages a single WS
// connection internally — no need to recreate.
let client: Client | null = null;
const getClient = (): Client => {
  if (client === null) client = new Client(colyseusUrl());
  return client;
};

// Phase 8 — host flow. Generate a 4-letter code locally and ask the
// server to create a room with that exact code. Retries up to 5 times
// on collision (the server rejects duplicates from the registry); 5
// is well past the practical collision rate for 24^4 codes.
const MAX_CODE_ATTEMPTS = 5;

export const createRoom = async (): Promise<Room<MatchState>> => {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode();
    try {
      // `create` (not `joinOrCreate`) so a colliding code surfaces as
      // an error instead of silently joining someone else's room.
      return await getClient().create<MatchState>("arena", { code });
    } catch (err) {
      lastError = err;
      // Loop and try again with a new random code.
    }
  }
  throw new Error(
    `createRoom: exhausted ${MAX_CODE_ATTEMPTS} attempts. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
};

// Phase 8 — guest flow. Normalize whatever the user typed and ask the
// matchmaker for a room with that code. Throws if no room matches —
// the caller surfaces the error to the menu UI.
export const joinRoomByCode = async (rawCode: string): Promise<Room<MatchState>> => {
  const code = normalizeRoomCode(rawCode);
  return await getClient().join<MatchState>("arena", { code });
};

// Phase 6 fallback kept for backwards-compat with `?net=1` quick-play.
// It just creates a fresh room every time (no code re-use). The Phase 8
// menu replaces this in the default flow.
export const connectToArena = async (): Promise<Room<MatchState>> => {
  return await createRoom();
};

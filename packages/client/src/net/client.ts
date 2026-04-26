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
// server to create a room with that exact code. Retries on registry
// COLLISIONS only (24^4 = 331,776 codes — collisions are statistically
// rare); transport / matchmaker errors bubble up immediately so the
// user sees a meaningful message instead of "exhausted 5 attempts".
const MAX_CODE_ATTEMPTS = 5;

export const createRoom = async (): Promise<Room<MatchState>> => {
  let lastCollisionError: unknown = null;
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const code = generateRoomCode();
    try {
      // `create` (not `joinOrCreate`) so a colliding code surfaces as
      // an error instead of silently joining someone else's room.
      return await getClient().create<MatchState>("arena", { code });
    } catch (err) {
      if (isCodeCollisionError(err)) {
        lastCollisionError = err;
        continue; // try a different random code
      }
      // Anything else (server down, schema mismatch, network) — abort
      // and let the menu surface the real reason.
      throw new Error(`Could not create room: ${describeNetworkError(err)}`);
    }
  }
  throw new Error(
    `Could not create room: ${MAX_CODE_ATTEMPTS} code collisions in a row` +
      (lastCollisionError !== null ? ` (last: ${describeNetworkError(lastCollisionError)})` : ""),
  );
};

// Phase 8 — guest flow. Normalize whatever the user typed and ask the
// matchmaker for a room with that code. Errors are wrapped so the
// menu can surface a readable message.
export const joinRoomByCode = async (rawCode: string): Promise<Room<MatchState>> => {
  const code = normalizeRoomCode(rawCode);
  try {
    return await getClient().join<MatchState>("arena", { code });
  } catch (err) {
    throw new Error(`Could not join "${code}": ${describeNetworkError(err)}`);
  }
};

// Phase 6 fallback kept for backwards-compat with `?net=1` quick-play.
// It just creates a fresh room every time (no code re-use). The Phase 8
// menu replaces this in the default flow.
export const connectToArena = async (): Promise<Room<MatchState>> => {
  return await createRoom();
};

// A "code already in use" error from our server-side reservation logic
// throws an Error with that exact phrase. Anything else (WebSocket
// failure, timeout, schema mismatch) is treated as a transport error
// and not retried — retrying with a new code wouldn't help.
const isCodeCollisionError = (err: unknown): boolean => {
  if (err === null || typeof err !== "object") return false;
  const msg = (err as { message?: unknown }).message;
  if (typeof msg !== "string") return false;
  return msg.includes("already in use");
};

// colyseus.js bubbles up a few error shapes:
//   - Error("...") for matchmaker failures (no room found, throw in onCreate)
//   - { code, message } for protocol-level errors
//   - the raw browser ProgressEvent if the WS connection itself fails
//     (server unreachable, CORS, schema decode crash). The default
//     toString of that one is "[object ProgressEvent]" — useless to
//     the user, so we replace it with a hint.
const describeNetworkError = (err: unknown): string => {
  if (err === null) return "unknown error";
  if (err instanceof Error) return err.message;
  if (typeof err === "object") {
    const obj = err as { message?: unknown; type?: unknown; code?: unknown };
    if (typeof obj.message === "string" && obj.message.length > 0) return obj.message;
    if (obj.type === "error") {
      // ProgressEvent from a failed WebSocket. Most common cause is
      // the server not being reachable from this URL.
      return "could not reach the game server (offline or wrong URL)";
    }
    if (obj.code !== undefined) return `error code ${String(obj.code)}`;
  }
  const s = String(err);
  return s === "[object Object]" || s === "[object ProgressEvent]"
    ? "could not reach the game server (offline or wrong URL)"
    : s;
};

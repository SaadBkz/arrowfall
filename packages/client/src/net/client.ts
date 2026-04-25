import { Client, type Room } from "colyseus.js";
import { MatchState } from "./schema.js";

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

// Connect to the single "arena" room (joinOrCreate). Phase 6 has no
// lobby/code system — every browser tab joins the same room. Phase 8
// will add named rooms with 4-letter codes.
export const connectToArena = async (): Promise<Room<MatchState>> => {
  return await getClient().joinOrCreate<MatchState>("arena");
};

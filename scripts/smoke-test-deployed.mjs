import { Client } from "colyseus.js";

const SERVER = process.argv[2] ?? "wss://arrowfall-server.fly.dev";
console.log(`[smoke] connecting to ${SERVER}…`);

const client = new Client(SERVER);
try {
  const room = await client.joinOrCreate("hello");
  console.log(`[smoke] OK · sessionId=${room.sessionId} roomId=${room.roomId}`);
  await room.leave();
  process.exit(0);
} catch (err) {
  console.error("[smoke] FAILED:", err);
  process.exit(1);
}

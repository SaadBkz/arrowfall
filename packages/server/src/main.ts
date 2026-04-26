import { createServer } from "node:http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ArenaRoom } from "./rooms/arena-room.js";

const port = Number(process.env["PORT"] ?? 2567);
const httpServer = createServer();

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Phase 8 — single "arena" definition keyed by `code` option.
//   - client.create("arena", { code: "ABCD" })
//       creates a fresh room and reserves the code in the registry.
//   - client.join("arena", { code: "ABCD" })
//       routes to the room created with that exact options.code (the
//       matchmaker uses filterBy to match on creation options).
//   - client.joinOrCreate("arena", { code: "ABCD" })
//       acceptable too — joins an existing room with that code, or
//       creates one if none exists. Used by the client lobby flow.
gameServer.define("arena", ArenaRoom).filterBy(["code"]);

await gameServer.listen(port);
console.log(`[colyseus] arrowfall server listening on http://localhost:${port}`);

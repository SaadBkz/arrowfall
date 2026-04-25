import { createServer } from "node:http";
import { Server } from "colyseus";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ArenaRoom } from "./rooms/arena-room.js";

const port = Number(process.env["PORT"] ?? 2567);
const httpServer = createServer();

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Single room name for Phase 6 — clients call joinOrCreate("arena").
// Lobby + room codes (Phase 8) will add more named definitions.
gameServer.define("arena", ArenaRoom);

await gameServer.listen(port);
console.log(`[colyseus] arrowfall server listening on http://localhost:${port}`);

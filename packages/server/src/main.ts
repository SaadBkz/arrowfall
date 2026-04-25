import { createServer } from "node:http";
import { Server, Room, WebSocketTransport, type Client } from "colyseus";

class HelloRoom extends Room {
  override onCreate(): void {
    console.log("[colyseus] HelloRoom created");
  }

  override onJoin(client: Client): void {
    console.log(`[colyseus] client joined: ${client.sessionId}`);
  }

  override onLeave(client: Client): void {
    console.log(`[colyseus] client left: ${client.sessionId}`);
  }
}

const port = Number(process.env.PORT ?? 2567);
const httpServer = createServer();

const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});
gameServer.define("hello", HelloRoom);

await gameServer.listen(port);
console.log(`[colyseus] listening on http://localhost:${port}`);

import { Application, Text } from "pixi.js";
import { Client } from "colyseus.js";

const SERVER_URL = import.meta.env.VITE_GAME_SERVER_URL ?? "wss://arrowfall-server.fly.dev";

const app = new Application();
await app.init({
  resizeTo: window,
  backgroundColor: 0x1a1a1a,
  antialias: true,
});

const container = document.getElementById("game");
if (!container) throw new Error("#game container not found");
container.appendChild(app.canvas);

const text = new Text({
  text: "ArrowFall — hello",
  style: {
    fill: 0xffffff,
    fontFamily: "monospace",
    fontSize: 48,
  },
});
text.anchor.set(0.5);

const status = new Text({
  text: "connexion serveur…",
  style: {
    fill: 0x888888,
    fontFamily: "monospace",
    fontSize: 18,
  },
});
status.anchor.set(0.5);

const layout = () => {
  text.x = app.screen.width / 2;
  text.y = app.screen.height / 2 - 30;
  status.x = app.screen.width / 2;
  status.y = app.screen.height / 2 + 30;
};
layout();
window.addEventListener("resize", layout);

app.stage.addChild(text, status);

console.log(`[colyseus] connecting to ${SERVER_URL}`);
const colyseusClient = new Client(SERVER_URL);
try {
  const room = await colyseusClient.joinOrCreate("hello");
  console.log(`[colyseus] connecté à HelloRoom — sessionId: ${room.sessionId}`);
  status.text = `connecté · ${room.sessionId}`;
  status.style.fill = 0x66ff88;
} catch (err) {
  console.error("[colyseus] connection failed:", err);
  status.text = "déconnecté (voir console)";
  status.style.fill = 0xff6666;
}

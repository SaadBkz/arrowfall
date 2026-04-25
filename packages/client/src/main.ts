import { Application } from "pixi.js";
import { Game, type GameMode } from "./game/index.js";
import "./style.css";

// `?net=1` flips the client into networked mode (Phase 6 — connects to
// the Colyseus arena room). Anything else (or no param) keeps the
// Phase 5 hot-seat behaviour. We document this in the client README.
const params = new URLSearchParams(window.location.search);
const mode: GameMode = params.get("net") === "1" ? "networked" : "local";

const container = document.getElementById("game");
if (!container) throw new Error("#game container not found");

const app = new Application();
await app.init({
  resizeTo: window,
  backgroundColor: 0x000000,
  antialias: false,
});

container.appendChild(app.canvas);

const game = new Game(app, mode);
game.start();

console.log(`[arrowfall] client booted — mode=${mode}`);

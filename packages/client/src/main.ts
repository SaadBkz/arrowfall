import { Application } from "pixi.js";
import { Game } from "./game/index.js";
import "./style.css";

const container = document.getElementById("game");
if (!container) throw new Error("#game container not found");

const app = new Application();
await app.init({
  resizeTo: window,
  backgroundColor: 0x000000,
  antialias: false,
});

container.appendChild(app.canvas);

const game = new Game(app);
game.start();

console.log("[arrowfall] client booted — phase 4 solo render");

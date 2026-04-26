import { Application } from "pixi.js";
import { Game, type GameMode } from "./game/index.js";
import { createRoom, joinRoomByCode } from "./net/index.js";
import { MenuOverlay } from "./ui/menu-overlay.js";
import "./style.css";

// Phase 8 — page boot orchestrator.
//
// URL params (mostly for quick repro / dev shortcuts; the menu is the
// primary entry point):
//   - ?local=1      — skip menu, go straight to hot-seat (Phase 5).
//   - ?host=1       — skip menu, host a fresh room (Phase 8).
//   - ?join=ABCD    — skip menu, join an existing room by code.
//   - ?net=1        — back-compat alias for ?host=1 (Phase 6 quick-play).
//
// Without any param the menu is shown and the user picks a mode.

const params = new URLSearchParams(window.location.search);
const joinParam = params.get("join");

const container = document.getElementById("game");
if (!container) throw new Error("#game container not found");

const app = new Application();
await app.init({
  resizeTo: window,
  backgroundColor: 0x000000,
  antialias: false,
});
container.appendChild(app.canvas);

const menu = new MenuOverlay();

// Game holder — instantiated lazily once the user picks a mode. Reusing
// the page-level `app` across modes (vs throwing away the renderer) lets
// us swap modes without reloading.
let game: Game | null = null;

const ensureGame = (mode: GameMode, room: Parameters<Game["attachRoom"]>[0] | null = null): Game => {
  if (game !== null) {
    throw new Error("ensureGame: a game is already running");
  }
  game = new Game(app, mode, room);
  game.start();
  return game;
};

const startLocal = (): void => {
  ensureGame("local");
  menu.hide();
  console.log("[arrowfall] mode=local");
};

const startHosted = async (): Promise<void> => {
  menu.showConnecting("Creating room…");
  try {
    const room = await createRoom();
    onRoomReady(room);
  } catch (err) {
    // createRoom already prefixes "Could not create room: ..." — pass through.
    menu.showError(describeError(err), () => showStartMenu());
  }
};

const startGuest = async (code: string): Promise<void> => {
  menu.showConnecting(`Joining ${code}…`);
  try {
    const room = await joinRoomByCode(code);
    onRoomReady(room);
  } catch (err) {
    // joinRoomByCode already prefixes "Could not join ..." — pass through.
    menu.showError(describeError(err), () => showStartMenu());
  }
};

const onRoomReady = (room: Awaited<ReturnType<typeof createRoom>>): void => {
  const g = ensureGame("networked", room);

  // Drive the menu off the room's phase string. We re-render on every
  // patch (cheap), because the lobby roster also changes when other
  // players join/ready up — not just on phase transitions.
  const renderForPhase = (): void => {
    const phase = room.state.phase;
    if (phase === "lobby") {
      menu.showLobby(room.state, room.sessionId, () => {
        // `ready` can be undefined for one tick after a fresh join (the
        // @colyseus/schema 3.x decoder bypasses the constructor); treat
        // undefined as "not ready" so the toggle still emits true.
        const current = room.state.ready?.get(room.sessionId) === true;
        g.sendReady(!current);
      });
    } else if (phase === "match-end") {
      menu.showMatchEnd(room.state, room.sessionId);
    } else {
      // playing / round-end → hide the overlay so the canvas is visible.
      menu.hide();
    }
  };

  g.onPhaseChange(renderForPhase);
  // Initial render — first state has already arrived (joinOrCreate
  // resolves after the schema is populated).
  renderForPhase();

  console.log(`[arrowfall] mode=networked code=${room.state.roomCode}`);
};

const showStartMenu = (): void => {
  menu.showStart({
    onLocal: startLocal,
    onHost: () => {
      void startHosted();
    },
    onJoin: () => {
      menu.showJoinForm(
        (code) => {
          void startGuest(code);
        },
        () => showStartMenu(),
      );
    },
  });
};

const describeError = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  return String(err);
};

// Boot — pick a flow based on URL params, fall back to the menu.
if (params.get("local") === "1") {
  startLocal();
} else if (joinParam !== null && joinParam.length > 0) {
  void startGuest(joinParam);
} else if (params.get("host") === "1" || params.get("net") === "1") {
  void startHosted();
} else {
  showStartMenu();
}

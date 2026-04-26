import { isValidRoomCode, normalizeRoomCode } from "../net/room-codes.js";
import { type MatchState } from "../net/schema.js";

// Phase 8 — single HTML overlay that hosts every non-gameplay screen:
//   - start menu (Local / Host / Join)
//   - join-by-code form
//   - connecting spinner
//   - lobby (room code + roster + ready toggle)
//   - match-end (winner + final scores)
//
// We render to the existing #menu-overlay div (defined in index.html)
// instead of building Pixi widgets — text-heavy UI in Pixi v8 is
// painful (every Text needs its own resolution + style), and the canvas
// is letter-boxed inside the viewport so a CSS overlay sits naturally
// on top of it.
//
// All view methods rebuild the panel innerHTML from scratch. That's
// fine for menu screens (rendered ≤ once per second), and the lobby
// re-render runs only on Colyseus state patches (typically a couple
// times per second when ready toggles propagate). Avoids the
// complexity of incremental DOM diffing.

export type StartHandlers = {
  readonly onLocal: () => void;
  readonly onHost: () => void;
  readonly onJoin: () => void;
};

export class MenuOverlay {
  private readonly root: HTMLElement;

  constructor(rootId: string = "menu-overlay") {
    const el = document.getElementById(rootId);
    if (el === null) throw new Error(`MenuOverlay: #${rootId} not found in DOM`);
    this.root = el;
  }

  hide(): void {
    this.root.classList.add("hidden");
    this.root.innerHTML = "";
  }

  showStart(h: StartHandlers): void {
    this.root.classList.remove("hidden");
    this.root.innerHTML = `
      <div class="menu-panel">
        <h1 class="menu-title">ARROWFALL</h1>
        <p class="menu-subtitle">Local couch, or play online with a friend.</p>
        <button class="menu-button" data-act="local">Hot-seat (local 1-4P)</button>
        <button class="menu-button primary" data-act="host">Host a room</button>
        <button class="menu-button" data-act="join">Join with code</button>
      </div>
    `;
    this.bindClick("local", h.onLocal);
    this.bindClick("host", h.onHost);
    this.bindClick("join", h.onJoin);
  }

  showJoinForm(onSubmit: (code: string) => void, onCancel: () => void): void {
    this.root.classList.remove("hidden");
    this.root.innerHTML = `
      <div class="menu-panel">
        <h1 class="menu-title">JOIN ROOM</h1>
        <p class="menu-subtitle">Enter the 4-letter code (no I or O).</p>
        <input class="menu-input" id="code-input" maxlength="4" autocomplete="off" spellcheck="false" placeholder="ABCD" />
        <p class="menu-error" id="code-error"></p>
        <button class="menu-button primary" data-act="submit">Join</button>
        <button class="menu-button" data-act="cancel">Back</button>
      </div>
    `;

    const input = this.root.querySelector<HTMLInputElement>("#code-input")!;
    const errorEl = this.root.querySelector<HTMLElement>("#code-error")!;
    input.focus();
    input.addEventListener("input", () => {
      // Force uppercase as the user types so the visible value matches
      // what we'll send. Keeps caret at the end (cheap & good enough
      // for a 4-character input).
      input.value = input.value.toUpperCase();
      errorEl.textContent = "";
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });

    const submit = (): void => {
      const code = normalizeRoomCode(input.value);
      if (!isValidRoomCode(code)) {
        errorEl.textContent = "Code must be 4 letters (no I or O).";
        return;
      }
      onSubmit(code);
    };

    this.bindClick("submit", submit);
    this.bindClick("cancel", onCancel);
  }

  showConnecting(message: string): void {
    this.root.classList.remove("hidden");
    this.root.innerHTML = `
      <div class="menu-panel">
        <h1 class="menu-title">CONNECTING</h1>
        <p class="menu-status">${escapeHtml(message)}</p>
      </div>
    `;
  }

  showError(message: string, onBack: () => void): void {
    this.root.classList.remove("hidden");
    this.root.innerHTML = `
      <div class="menu-panel">
        <h1 class="menu-title">ERROR</h1>
        <p class="menu-error">${escapeHtml(message)}</p>
        <button class="menu-button" data-act="back">Back</button>
      </div>
    `;
    this.bindClick("back", onBack);
  }

  // Lobby view. Re-renders on every state patch; cheap because the
  // panel is < 200 nodes deep.
  //
  // All `state.X?` fallbacks are defenses against the @colyseus/schema
  // 3.x decoder bypassing our constructor (Object.create), which leaves
  // collection fields undefined until the server emits a patch touching
  // them. The lobby renders on every state-change so this can fire on
  // a partial state.
  showLobby(state: MatchState, mySessionId: string, onToggleReady: () => void): void {
    this.root.classList.remove("hidden");
    const isReady = state.ready?.get(mySessionId) === true;
    const playerCount = state.archers?.size ?? 0;
    const ready = countReady(state);
    const code = escapeHtml(state.roomCode ?? "");

    let rosterHtml = "";
    state.archers?.forEach((archer, sessionId) => {
      const slot = escapeHtml(archer.id);
      const me = sessionId === mySessionId ? " (you)" : "";
      const isPlayerReady = state.ready?.get(sessionId) === true;
      rosterHtml += `
        <div class="row">
          <span>${slot}${me}</span>
          <span class="${isPlayerReady ? "ready" : "not-ready"}">${
            isPlayerReady ? "READY" : "..."
          }</span>
        </div>
      `;
    });

    const buttonLabel = isReady ? "Cancel ready" : "Ready up";
    const buttonClass = isReady ? "menu-button danger" : "menu-button primary";
    // Match needs >= 2 players AND every connected session ready.
    const waitingFor =
      playerCount < 2
        ? "Waiting for at least 1 more player."
        : ready < playerCount
          ? `${ready}/${playerCount} ready — match starts when everyone is ready.`
          : "All ready — starting match...";

    this.root.innerHTML = `
      <div class="menu-panel">
        <h1 class="menu-title">LOBBY</h1>
        <p class="menu-subtitle">Share this code with your friends:</p>
        <div class="lobby-code">${code}</div>
        <div class="lobby-roster">${rosterHtml}</div>
        <p class="menu-status">${escapeHtml(waitingFor)}</p>
        <button class="${buttonClass}" data-act="ready">${buttonLabel}</button>
      </div>
    `;
    this.bindClick("ready", onToggleReady);
  }

  // Match-end view — auto-returns to lobby on the server (phaseTimer
  // counts down and resets), so we just render the trophy screen
  // until the next phase change.
  showMatchEnd(state: MatchState, mySessionId: string): void {
    this.root.classList.remove("hidden");
    const winnerSessionId = state.matchWinnerSessionId ?? "";
    const winnerArcher =
      winnerSessionId !== "" ? state.archers?.get(winnerSessionId) : undefined;
    const winnerLabel =
      winnerSessionId === ""
        ? "No winner"
        : winnerSessionId === mySessionId
          ? "You win!"
          : `${(winnerArcher?.id ?? winnerSessionId).toUpperCase()} wins!`;

    let scoresHtml = "";
    state.archers?.forEach((archer, sessionId) => {
      const slot = escapeHtml(archer.id);
      const me = sessionId === mySessionId ? " (you)" : "";
      const wins = state.wins?.get(sessionId) ?? 0;
      scoresHtml += `<div class="row"><span>${slot}${me}</span><span>${wins} / ${state.targetWins ?? 0}</span></div>`;
    });

    const seconds = Math.max(0, Math.ceil((state.phaseTimer ?? 0) / 60));

    this.root.innerHTML = `
      <div class="menu-panel match-end">
        <h1 class="menu-title">MATCH OVER</h1>
        <div class="winner">${escapeHtml(winnerLabel)}</div>
        <p class="scores">First to ${state.targetWins ?? 0}</p>
        <div class="lobby-roster">${scoresHtml}</div>
        <p class="menu-status">Returning to lobby in ${seconds}s...</p>
      </div>
    `;
  }

  private bindClick(act: string, handler: () => void): void {
    const btn = this.root.querySelector<HTMLButtonElement>(`[data-act="${act}"]`);
    if (btn === null) return;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      handler();
    });
  }
}

const countReady = (state: MatchState): number => {
  let n = 0;
  state.ready?.forEach((v) => {
    if (v) n += 1;
  });
  return n;
};

// Defensive HTML escaper for any user-controlled string we drop into
// innerHTML. Today nothing in the schema lets remote players feed us
// arbitrary text, but the room code field is a string and could
// theoretically grow into a "display name" later — escaping now keeps
// the door closed on XSS regressions.
const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

import { type World } from "@arrowfall/engine";
import { MAX_INVENTORY } from "@arrowfall/shared";
import { Container, Text, TextStyle } from "pixi.js";
import { archerColorFor, HUD_TEXT_COLOR } from "../colors.js";

const LINE_HEIGHT = 10;
const FONT_SIZE = 8;
const PADDING = 4;

const baseStyle = (fill: number): TextStyle =>
  new TextStyle({
    fontFamily: "monospace",
    fontSize: FONT_SIZE,
    fill,
    lineHeight: LINE_HEIGHT,
  });

// Optional badge string shown at the top of the footer (e.g.
// "online — 2 players" or "local — 4 players"). null hides the line.
export type HudBadge = string | null;

// Top-left overlay. Lives inside gameRoot (logical 480×270 coordinates)
// so it scales with the rest of the view. Each archer gets its own Text
// so the player id can be tinted in its slot colour — Pixi Text doesn't
// support per-character colour, so we'd need BitmapFont for inline tints.
// Multiple Text objects is simpler and cheap enough for ≤ 4 lines.
export class HudRenderer {
  readonly view: Container;
  private readonly playerLines: Map<string, Text> = new Map();
  private readonly footer: Text;

  constructor() {
    this.view = new Container();

    // Footer (badge, arrows count, fps, reset hint) shares one Text —
    // same colour, multi-line.
    this.footer = new Text({ text: "", style: baseStyle(HUD_TEXT_COLOR) });
    this.footer.x = PADDING;
    this.footer.resolution = 2;
    this.view.addChild(this.footer);
  }

  update(
    world: World,
    fps: number,
    playerIds: ReadonlyArray<string>,
    badge: HudBadge = null,
  ): void {
    // Ensure a Text line per player, in slot order. Allocate lazily so a
    // PLAYER_COUNT bump doesn't require touching this file.
    let y = PADDING;
    for (let i = 0; i < playerIds.length; i++) {
      const id = playerIds[i]!;
      let line = this.playerLines.get(id);
      if (line === undefined) {
        line = new Text({
          text: "",
          style: baseStyle(archerColorFor(id, i)),
        });
        line.x = PADDING;
        line.resolution = 2;
        this.view.addChild(line);
        this.playerLines.set(id, line);
      }
      line.y = y;
      y += LINE_HEIGHT;

      const a = world.archers.get(id);
      if (a === undefined) {
        // Despawned (deathTimer maxed out) — still surface the player
        // so the HUD doesn't shrink mid-round.
        line.text = `${id}: gone`;
      } else {
        const status = a.alive ? "alive" : "dead ";
        line.text = `${id}: inv ${a.inventory}/${MAX_INVENTORY} ${status}`;
      }
    }

    this.footer.y = y;
    const lines: string[] = [];
    if (badge !== null) lines.push(badge);
    lines.push(
      `arrows: ${world.arrows.length}`,
      `fps: ${Math.round(fps)}`,
      `[Backspace] reset`,
    );
    this.footer.text = lines.join("\n");
  }

  dispose(): void {
    for (const line of this.playerLines.values()) {
      line.destroy();
    }
    this.playerLines.clear();
    this.footer.destroy();
    this.view.destroy();
  }
}

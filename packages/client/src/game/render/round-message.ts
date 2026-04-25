import { ARENA_HEIGHT_PX, ARENA_WIDTH_PX } from "@arrowfall/shared";
import { Container, Text, TextStyle } from "pixi.js";
import { archerColorFor } from "../colors.js";
import { type RoundOutcome } from "../round-state.js";

// Centred overlay shown when a round resolves. Lives inside `gameRoot`
// (logical 480×270 coordinates) so it scales with the rest of the view.
// Hidden during `ongoing`; shown for `win` / `draw` until the next reset.
export class RoundMessageRenderer {
  readonly view: Container;
  private readonly text: Text;

  constructor() {
    this.view = new Container();
    this.view.visible = false;

    const style = new TextStyle({
      fontFamily: "monospace",
      fontSize: 16,
      fontWeight: "bold",
      fill: 0xffffff,
      lineHeight: 18,
    });
    this.text = new Text({ text: "", style });
    this.text.resolution = 2;
    this.text.anchor.set(0.5, 0.5);
    this.text.x = ARENA_WIDTH_PX / 2;
    this.text.y = ARENA_HEIGHT_PX / 2;
    this.view.addChild(this.text);
  }

  render(outcome: RoundOutcome): void {
    if (outcome.kind === "ongoing") {
      this.view.visible = false;
      return;
    }
    this.view.visible = true;

    if (outcome.kind === "draw") {
      this.text.text = "Draw!";
      this.text.style.fill = 0xffffff;
      return;
    }

    // win
    this.text.text = `${outcome.winnerId.toUpperCase()} wins!`;
    // Tint the message in the winner's slot colour for at-a-glance
    // identification.
    this.text.style.fill = archerColorFor(outcome.winnerId, 0);
  }

  dispose(): void {
    this.text.destroy();
    this.view.destroy();
  }
}

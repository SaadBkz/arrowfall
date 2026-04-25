import { type World } from "@arrowfall/engine";
import { MAX_INVENTORY } from "@arrowfall/shared";
import { Container, Text, TextStyle } from "pixi.js";
import { HUD_TEXT_COLOR } from "../colors.js";

// Top-left overlay. Lives inside gameRoot (logical 480×270 coordinates)
// so it scales with the rest of the view. Text is rendered at fontSize 8
// to read as crisp pixels at any integer scale.
export class HudRenderer {
  readonly view: Container;
  private readonly text: Text;

  constructor() {
    this.view = new Container();
    const style = new TextStyle({
      fontFamily: "monospace",
      fontSize: 8,
      fill: HUD_TEXT_COLOR,
      lineHeight: 10,
    });
    this.text = new Text({ text: "", style });
    this.text.x = 4;
    this.text.y = 4;
    this.text.resolution = 2;
    this.view.addChild(this.text);
  }

  update(world: World, fps: number): void {
    const lines: string[] = [];
    const sortedIds = [...world.archers.keys()].sort();
    for (const id of sortedIds) {
      const a = world.archers.get(id)!;
      const status = a.alive ? "alive" : "dead";
      lines.push(`${id}: inv ${a.inventory}/${MAX_INVENTORY} ${status}`);
    }
    lines.push(`arrows: ${world.arrows.length}`);
    lines.push(`fps: ${Math.round(fps)}`);
    lines.push(`[R] reset`);
    this.text.text = lines.join("\n");
  }

  dispose(): void {
    this.text.destroy();
    this.view.destroy();
  }
}

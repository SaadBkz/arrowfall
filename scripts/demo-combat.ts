// Headless 2-archer combat demo. Drives a scripted World over 600 frames
// and prints a one-line trace per frame. NOT a test — exists to surface
// the engine's behaviour to a human eyeball outside Vitest.
//
// Usage: pnpm demo:combat
//        (or: pnpm exec tsx scripts/demo-combat.ts)
//
// All randomness/clocks are forbidden — this script is pure inputs in,
// trace out, identical across runs.

import {
  type ArcherInput,
  type MapJson,
  NEUTRAL_INPUT,
  TILE_SIZE,
} from "@arrowfall/shared";
import {
  type World,
  createWorld,
  parseMap,
  stepWorld,
} from "@arrowfall/engine";

// Inlined copy of packages/engine/src/__fixtures__/maps/test-arena-walls.json
// — the engine's fixtures live inside its package, but this script sits
// outside src/ and only imports the public engine API. Embedding the
// fixture keeps the demo dependency-free and easy to tweak.
const TEST_ARENA_WALLS: MapJson = {
  id: "test-arena-walls",
  name: "Test Arena (walls + jumpthru + spike)",
  width: 30,
  height: 17,
  rows: [
    "..............................",
    "..P........................P..",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    ".......----------------.......",
    "..............................",
    "..............................",
    "##..........................##",
    "##..........................##",
    "##..........................##",
    "##..........................##",
    "##..........................##",
    "##............^.............##",
    "##############################",
  ],
};

const FRAMES = 600;
const IDS = ["p1", "p2"] as const;

// Same shape of script as the pivot test, modulo different timings to
// give the human reader a varied trace (shoots, jumps, dodges).
const inputAt = (id: string, f: number): ArcherInput => {
  if (id === "p1") {
    const right = f >= 80 && f < 200;
    const left = f >= 300 && f < 400;
    const jump = f === 220 || f === 350;
    const dodge = f === 250 || f === 410;
    const shoot = f === 100 || f === 150 || f === 320 || f === 412 || f === 500;
    return {
      ...NEUTRAL_INPUT,
      right,
      left,
      jump,
      dodge,
      shoot,
      aimDirection: shoot ? "E" : null,
    };
  }
  const left = f >= 80 && f < 240;
  const right = f >= 320 && f < 440;
  const jump = f === 240 || f === 380;
  const dodge = f === 270 || f === 430;
  const shoot = f === 110 || f === 180 || f === 330 || f === 470;
  return {
    ...NEUTRAL_INPUT,
    left,
    right,
    jump,
    dodge,
    shoot,
    aimDirection: shoot ? "W" : null,
  };
};

const inputsForFrame = (f: number): Map<string, ArcherInput> => {
  const m = new Map<string, ArcherInput>();
  for (const id of IDS) m.set(id, inputAt(id, f));
  return m;
};

const fmt = (n: number): string => n.toFixed(2);

const fmtArcher = (id: string, w: World): string => {
  const a = w.archers.get(id);
  if (a === undefined) return `${id}: gone`;
  const alive = a.alive ? "Y" : "N";
  return `${id}: pos=(${fmt(a.pos.x)},${fmt(a.pos.y)}) inv=${a.inventory} alive=${alive}`;
};

const fmtEvents = (w: World): string => {
  if (w.events.length === 0) return "[]";
  return (
    "[" +
    w.events
      .map((e) => {
        switch (e.kind) {
          case "arrow-fired":
            return `fire(${e.ownerId}→${e.arrowId})`;
          case "arrow-caught":
            return `catch(${e.catcherId}<-${e.arrowId})`;
          case "archer-killed":
            return `kill(${e.victimId},${e.cause}${e.killerId ? "←" + e.killerId : ""})`;
          case "arrow-picked-up":
            return `pickup(${e.pickerId}<-${e.arrowId})`;
        }
      })
      .join(",") +
    "]"
  );
};

const main = (): void => {
  const map = parseMap(TEST_ARENA_WALLS);
  const spawnPoints = map.spawns.map((s) => ({
    x: s.x * TILE_SIZE,
    y: s.y * TILE_SIZE,
  }));
  let w: World = createWorld(map, spawnPoints, [...IDS]);

  console.log(
    `# demo-combat — ${FRAMES} frames, 2 archers on ${map.name}`,
  );
  console.log(`# tick=N | a1: pos=(x,y) inv=I alive=Y/N | a2: ... | arrows=K | events=[...]`);

  for (let f = 0; f < FRAMES; f++) {
    w = stepWorld(w, inputsForFrame(f));
    const line =
      `tick=${w.tick} | ${fmtArcher("p1", w)} | ${fmtArcher("p2", w)}` +
      ` | arrows=${w.arrows.length} | events=${fmtEvents(w)}`;
    console.log(line);
  }

  console.log(`# done. final tick=${w.tick}, arrows in world=${w.arrows.length}`);
};

main();

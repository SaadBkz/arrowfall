import { TICK_RATE_HZ } from "@arrowfall/shared";

// Fixed-timestep accumulator (Glenn Fiedler "Fix Your Timestep!"). The
// engine is 60 Hz deterministic; the renderer ticks at the monitor's
// refresh rate (60–144 Hz typical). We bridge the two by accumulating
// real elapsed milliseconds and consuming whole 16.667 ms ticks.

export const STEP_MS = 1000 / TICK_RATE_HZ;

// Cap per-frame steps to avoid the "spiral of death" after a long
// pause (alt-tab, debugger, GC stall). 5 ticks ≈ 83 ms — beyond that,
// we discard remaining accumulator time rather than try to catch up.
export const MAX_STEPS_PER_FRAME = 5;

// Pure helper: advance the simulation by as many fixed steps as `deltaMS`
// affords, calling `stepFn` once per step. Returns the leftover accumulator
// to carry into the next frame.
export const runFixedStep = (deltaMS: number, accumulator: number, stepFn: () => void): number => {
  let acc = accumulator + deltaMS;
  let steps = 0;

  while (acc >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
    stepFn();
    acc -= STEP_MS;
    steps += 1;
  }

  // If we hit the cap and the accumulator is still piling up, drop the
  // backlog — we'd otherwise be stepping forever after a freeze.
  if (steps === MAX_STEPS_PER_FRAME && acc >= STEP_MS) {
    return 0;
  }

  return acc;
};

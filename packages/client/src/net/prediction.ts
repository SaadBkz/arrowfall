import { type World, createWorld, stepWorld } from "@arrowfall/engine";
import { type ArcherInput, type MapData, TILE_SIZE, type Vec2 } from "@arrowfall/shared";
import { matchStateToWorld } from "./match-mirror.js";
import type { MatchState } from "./schema.js";

// Spec §8.5 — "if écart > seuil, lerp court (4 frames)".
// Tunables: 4 px is one half-tile, 4 frames is ~67 ms at 60 Hz. Both
// kept as exported constants so tests can pin them.
export const CORRECTION_DIVERGENCE_PX = 4;
export const CORRECTION_LERP_FRAMES = 4;

// Cap pendingInputs growth. RTT 100 ms at 60 Hz ≈ 6 in flight; 120
// covers a 2 s acked-pause without falling over. Older entries get
// dropped (FIFO) — that just means they ran on a server view we no
// longer have, which is the same as not predicting at all. The next
// reconcile will snap us back via the lerp.
const MAX_PENDING_INPUTS = 120;

type PendingInput = {
  readonly clientTick: number;
  readonly input: ArcherInput;
};

// Tracks the local-archer offset between the predicted world and the
// reconciled world right after a reconcile that diverged. The render
// reads `getRenderPosition(localArcherId)` which decays this offset to
// (0,0) over CORRECTION_LERP_FRAMES. Pure data — the predictedWorld's
// own position is already the reconciled (truthful) one; the offset is
// purely cosmetic to avoid a snap.
type RenderCorrection = {
  readonly slotId: string;
  readonly offset: Vec2;
  readonly framesLeft: number;
};

// Owns the local prediction state for a networked Game. One instance
// per Room connection. Hot-seat (mode === "local") never instantiates
// this — the local World is the source of truth there.
export class PredictionEngine {
  private readonly mapData: MapData;
  // Monotonic counter — assigned to each input tagged on the wire and
  // used as the key for pendingInputs. Never reset (see arena-room
  // handleReset comment); this is a local clock, not round state.
  private clientTickCounter = 0;
  private predictedWorld: World;
  private pendingInputs: PendingInput[] = [];
  private localSlotId: string | null = null;
  private correction: RenderCorrection | null = null;

  // `spawnsPx` is only used to seed the empty pre-connect world.
  // After the first reconcile, the world is rebuilt from server
  // snapshots via matchStateToWorld, which uses the same mapData.
  constructor(mapData: MapData, spawnsPx: ReadonlyArray<Vec2>) {
    this.mapData = mapData;
    this.predictedWorld = createWorld(mapData, spawnsPx, []);
  }

  // Set after the first server snapshot arrives — that's when we can
  // resolve our sessionId to a slot id (p1..p6). Until then, stepLocal
  // is a no-op (we still buffer the input + bump clientTick so the
  // first acked input has a non-zero tick).
  setLocalSlotId(slotId: string | null): void {
    this.localSlotId = slotId;
  }

  getLocalSlotId(): string | null {
    return this.localSlotId;
  }

  // Single fixed-step advance. Returns the assigned clientTick so the
  // caller can stamp it on the wire payload. Always increments — even
  // when we don't have a slot yet — so wire ticks stay strictly
  // monotonic from the server's POV.
  stepLocal(input: ArcherInput): number {
    this.clientTickCounter += 1;
    const tick = this.clientTickCounter;

    if (this.localSlotId === null) {
      // No slot resolved yet — don't queue anything (we have nothing
      // useful to replay), and don't try to advance the world; the
      // first reconcile will set things up.
      return tick;
    }

    this.pendingInputs.push({ clientTick: tick, input });
    if (this.pendingInputs.length > MAX_PENDING_INPUTS) {
      this.pendingInputs.shift();
    }

    const inputs = new Map<string, ArcherInput>();
    inputs.set(this.localSlotId, input);
    this.predictedWorld = stepWorld(this.predictedWorld, inputs);

    // Decay correction by one frame. Done here (not on render) so the
    // cadence is tied to fixed-step ticks, matching the prompt's "lerp
    // sur 4 frames" wording.
    if (this.correction !== null) {
      const next = this.correction.framesLeft - 1;
      this.correction = next <= 0 ? null : { ...this.correction, framesLeft: next };
    }

    return tick;
  }

  // On every server state push: rebuild predictedWorld from the
  // snapshot, drop pending inputs ≤ acked, replay the remainder. If
  // the resulting local-archer position diverged from where we'd
  // predicted (i.e. our previous predictedWorld) by more than
  // CORRECTION_DIVERGENCE_PX, arm a render correction lerp instead of
  // letting the renderer snap.
  //
  // `mySessionId` is what we use to look ourselves up in the schema —
  // the slot id is recorded as a side effect (the server is the source
  // of truth for slot allocation).
  reconcile(state: MatchState, mySessionId: string): void {
    // Defensive `?.` against @colyseus/schema 3.x — see match-mirror.
    // If archers/lastInputTick aren't decoded yet we just skip; the
    // next state-change tick will fire reconcile again.
    if (state.archers === undefined) return;

    // Resolve / refresh slot id. The server can change our slot id
    // across rejoins (Phase 8 territory) but for Phase 7 it's stable.
    const myArcherState = state.archers.get(mySessionId);
    if (myArcherState !== undefined) {
      this.localSlotId = myArcherState.id;
    }

    const ackedTick = state.lastInputTick?.get(mySessionId) ?? 0;
    // Keep only inputs the server hasn't acked yet. Strict > so that
    // the input *exactly* acked is dropped (the server already applied
    // its effect and reflects it in the snapshot).
    this.pendingInputs = this.pendingInputs.filter((p) => p.clientTick > ackedTick);

    // Save where we *thought* the local archer was, to decide whether
    // to arm a lerp.
    const previousLocal =
      this.localSlotId !== null
        ? (this.predictedWorld.archers.get(this.localSlotId) ?? null)
        : null;

    // Rebuild predicted from the server snapshot.
    let world = matchStateToWorld(state, this.mapData);

    // Replay any remaining pending inputs. Each one bumps the world
    // tick by 1 — that's expected; the local archer is "ahead" of the
    // server by `pendingInputs.length` ticks.
    if (this.localSlotId !== null) {
      for (const p of this.pendingInputs) {
        const inputs = new Map<string, ArcherInput>();
        inputs.set(this.localSlotId, p.input);
        world = stepWorld(world, inputs);
      }
    }

    // Compare local archer pre/post and decide on a correction lerp.
    if (this.localSlotId !== null && previousLocal !== null) {
      const after = world.archers.get(this.localSlotId);
      if (after !== undefined) {
        const dx = previousLocal.pos.x - after.pos.x;
        const dy = previousLocal.pos.y - after.pos.y;
        const distSq = dx * dx + dy * dy;
        const threshSq = CORRECTION_DIVERGENCE_PX * CORRECTION_DIVERGENCE_PX;
        if (distSq > threshSq) {
          this.correction = {
            slotId: this.localSlotId,
            offset: { x: dx, y: dy },
            framesLeft: CORRECTION_LERP_FRAMES,
          };
        } else {
          // Sub-threshold drift snaps silently — adding a 1-frame
          // micro-lerp here would just be dithering.
          this.correction = null;
        }
      }
    }

    this.predictedWorld = world;
  }

  // Read-only accessor. The caller (Game.tickNetworked) overlays
  // interpolated remote archers when rendering, but reads arrows and
  // the local archer from here.
  getPredictedWorld(): World {
    return this.predictedWorld;
  }

  // Decaying offset to *add* to the local archer's predicted position
  // at render time. (0,0) when no correction is active.
  //
  // The decay is linear: offset * framesLeft / CORRECTION_LERP_FRAMES.
  // Picked over an ease curve because it composes correctly when a
  // *new* correction lands mid-decay — the next reconcile just resets
  // framesLeft to the full count with the new offset.
  getRenderCorrection(): Vec2 {
    if (this.correction === null) return { x: 0, y: 0 };
    const t = this.correction.framesLeft / CORRECTION_LERP_FRAMES;
    return {
      x: this.correction.offset.x * t,
      y: this.correction.offset.y * t,
    };
  }

  // Test/debug surface. Not intended to be used by Game.
  getPendingInputCount(): number {
    return this.pendingInputs.length;
  }
  getClientTickCounter(): number {
    return this.clientTickCounter;
  }
}

// Convert a MapData's tile-indexed spawns into pixel coords. Mirrors
// the helper in Game (kept inline there for legibility) — exported so
// PredictionEngine consumers don't need to know the conversion.
export const spawnsPxFromMap = (mapData: MapData): ReadonlyArray<Vec2> =>
  mapData.spawns.map((s) => ({ x: s.x * TILE_SIZE, y: s.y * TILE_SIZE }));

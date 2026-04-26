import type { Archer } from "@arrowfall/engine";
import { ARCHER_HITBOX_H } from "@arrowfall/engine";
import type { Vec2 } from "@arrowfall/shared";
import type { ArcherState, MatchState } from "./schema.js";

// Spec §8.5 — render remote archers ~100 ms behind the freshest server
// state. We work in ticks (server clock): 30 Hz patch rate × 2 ticks
// = ~67 ms which lands inside the spec's 100 ms target after we add
// the local frame budget.
//
// 5-snapshot ring per remote sessionId is enough to bracket the
// rendering tick under realistic patch jitter (server emits at ~30 Hz,
// we sample at ~60 Hz; a 2-tick offset means the last 5 entries cover
// roughly 165 ms of history — comfortably more than needed).
export const INTERPOLATION_DELAY_TICKS = 2;
export const INTERPOLATION_BUFFER_SIZE = 5;

// What we keep per snapshot per archer. We deliberately copy out of
// the schema instances (which mutate in place under our feet) and
// store plain primitives — the buffer holds historical state that
// must NOT change after capture.
type ArcherSnapshot = {
  readonly slotId: string;
  readonly posX: number;
  readonly posY: number;
  readonly velX: number;
  readonly velY: number;
  readonly facing: string;
  readonly state: string;
  readonly inventory: number;
  readonly alive: boolean;
  readonly deathTimer: number;
  readonly spawnIframeTimer: number;
  readonly dodgeIframeTimer: number;
};

type BufferEntry = {
  readonly serverTick: number;
  readonly archer: ArcherSnapshot;
};

const snapshotOf = (s: ArcherState): ArcherSnapshot => ({
  slotId: s.id,
  posX: s.posX,
  posY: s.posY,
  velX: s.velX,
  velY: s.velY,
  facing: s.facing,
  state: s.state,
  inventory: s.inventory,
  alive: s.alive,
  deathTimer: s.deathTimer,
  spawnIframeTimer: s.spawnIframeTimer,
  dodgeIframeTimer: s.dodgeIframeTimer,
});

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Pure: pick the two snapshots that bracket `targetTick` and lerp.
// Returns the fallback (latest snapshot) when the buffer hasn't yet
// caught up to the target — typically only on the first 1-2 frames
// after a remote archer joins (cold start).
//
// Buffer is assumed sorted by serverTick ascending (push() preserves
// that since server ticks are monotonic).
export const interpolateBuffer = (
  buffer: ReadonlyArray<BufferEntry>,
  targetTick: number,
): ArcherSnapshot | null => {
  if (buffer.length === 0) return null;
  if (buffer.length === 1) return buffer[0]!.archer;

  // targetTick before the buffer's oldest entry → use oldest (cold
  // start case where we joined late and have only fresh data).
  const oldest = buffer[0]!;
  if (targetTick <= oldest.serverTick) return oldest.archer;

  // targetTick at or beyond the latest → use latest (we're caught
  // up; rare in practice since INTERPOLATION_DELAY_TICKS=2 puts the
  // target behind what we receive).
  const latest = buffer[buffer.length - 1]!;
  if (targetTick >= latest.serverTick) return latest.archer;

  // Find the bracketing pair.
  for (let i = 0; i < buffer.length - 1; i++) {
    const a = buffer[i]!;
    const b = buffer[i + 1]!;
    if (a.serverTick <= targetTick && targetTick <= b.serverTick) {
      const span = b.serverTick - a.serverTick;
      // Same-tick (shouldn't happen — server ticks are unique — but
      // guard against it returning NaN if it ever does).
      if (span === 0) return b.archer;
      const t = (targetTick - a.serverTick) / span;
      return {
        slotId: b.archer.slotId,
        posX: lerp(a.archer.posX, b.archer.posX, t),
        posY: lerp(a.archer.posY, b.archer.posY, t),
        velX: lerp(a.archer.velX, b.archer.velX, t),
        velY: lerp(a.archer.velY, b.archer.velY, t),
        // Discrete fields snap to the newer side mid-lerp — visually
        // a 1-frame "jump" between the two states is fine.
        facing: b.archer.facing,
        state: b.archer.state,
        inventory: b.archer.inventory,
        alive: b.archer.alive,
        deathTimer: b.archer.deathTimer,
        spawnIframeTimer: b.archer.spawnIframeTimer,
        dodgeIframeTimer: b.archer.dodgeIframeTimer,
      };
    }
  }

  // Unreachable given the early-returns above; defensive.
  return latest.archer;
};

// One PerArcherBuffer per non-local sessionId we've seen. Each owns a
// rolling window of snapshots tagged by their server tick. push()
// drops the oldest entry when the size exceeds INTERPOLATION_BUFFER_SIZE.
class PerArcherBuffer {
  private readonly entries: BufferEntry[] = [];

  push(serverTick: number, archer: ArcherSnapshot): void {
    // Reject same-tick duplicates so two sequential reconciles on
    // identical state don't pollute the buffer.
    const last = this.entries[this.entries.length - 1];
    if (last !== undefined && last.serverTick === serverTick) return;
    this.entries.push({ serverTick, archer });
    while (this.entries.length > INTERPOLATION_BUFFER_SIZE) {
      this.entries.shift();
    }
  }

  snapshots(): ReadonlyArray<BufferEntry> {
    return this.entries;
  }

  size(): number {
    return this.entries.length;
  }
}

// Owns the per-session interpolation buffers. tickFromState() ingests
// the latest schema state on every onStateChange; archerAt() reads it
// at render time.
export class RemoteInterpolator {
  private readonly buffers = new Map<string, PerArcherBuffer>();
  private latestServerTick = 0;

  // Push a snapshot for every non-local archer in `state`. Local
  // archer is excluded (its position is rendered from the predicted
  // world, not interpolated).
  ingest(state: MatchState, localSessionId: string | null): void {
    const tick = state.tick;
    if (tick > this.latestServerTick) this.latestServerTick = tick;

    const seenSessions = new Set<string>();
    state.archers.forEach((archerSt: ArcherState, sessionId: string) => {
      seenSessions.add(sessionId);
      if (sessionId === localSessionId) return;
      let buf = this.buffers.get(sessionId);
      if (buf === undefined) {
        buf = new PerArcherBuffer();
        this.buffers.set(sessionId, buf);
      }
      buf.push(tick, snapshotOf(archerSt));
    });

    // Drop buffers for sessions that have left.
    for (const sessionId of [...this.buffers.keys()]) {
      if (!seenSessions.has(sessionId)) this.buffers.delete(sessionId);
    }
  }

  // Returns the current target server tick the renderer should
  // sample at (latestServerTick - INTERPOLATION_DELAY_TICKS, floored
  // at 0). Exposed for tests / debug HUD.
  getRenderTargetTick(): number {
    return Math.max(0, this.latestServerTick - INTERPOLATION_DELAY_TICKS);
  }

  // Returns interpolated archer state for sessionId at the current
  // render-target tick, or null if we have no data for that session.
  archerAt(sessionId: string): ArcherSnapshot | null {
    const buf = this.buffers.get(sessionId);
    if (buf === undefined) return null;
    return interpolateBuffer(buf.snapshots(), this.getRenderTargetTick());
  }

  // Iteration for the renderer — yields (sessionId, snapshot) for
  // every non-local archer with at least one snapshot in the buffer.
  forEach(cb: (sessionId: string, snap: ArcherSnapshot) => void): void {
    const target = this.getRenderTargetTick();
    for (const [sessionId, buf] of this.buffers) {
      const snap = interpolateBuffer(buf.snapshots(), target);
      if (snap !== null) cb(sessionId, snap);
    }
  }

  // Cold-start probe: true if we don't yet have ≥ 2 snapshots for the
  // session, in which case Game can fall back to direct rendering.
  isColdStart(sessionId: string): boolean {
    const buf = this.buffers.get(sessionId);
    if (buf === undefined) return true;
    return buf.size() < 2;
  }
}

// Build an Archer engine instance from an interpolated snapshot.
// Mirrors the body height computation in match-mirror.ts — we reuse
// it so the renderer reads from a single uniform shape.
export const archerFromSnapshot = (snap: ArcherSnapshot): Archer => ({
  id: snap.slotId,
  pos: { x: snap.posX, y: snap.posY } as Vec2,
  vel: { x: snap.velX, y: snap.velY } as Vec2,
  facing: (snap.facing === "L" ? "L" : "R") as Archer["facing"],
  state: (snap.state === "dodging" ? "dodging" : "idle") as Archer["state"],
  dodgeTimer: 0,
  dodgeIframeTimer: snap.dodgeIframeTimer,
  dodgeCooldownTimer: 0,
  coyoteTimer: 0,
  jumpBufferTimer: 0,
  prevBottom: snap.posY + ARCHER_HITBOX_H,
  inventory: snap.inventory,
  shootCooldownTimer: 0,
  alive: snap.alive,
  deathTimer: snap.deathTimer,
  spawnIframeTimer: snap.spawnIframeTimer,
});

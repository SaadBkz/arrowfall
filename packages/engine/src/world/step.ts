import {
  type AABB,
  type ArcherInput,
  aabbIntersects,
  ARROW_GROUNDED_PICKUP_DELAY,
  DEATH_DURATION_FRAMES,
  HEAD_HITBOX_H,
  MAX_INVENTORY,
  NEUTRAL_INPUT,
  STOMP_BOUNCE_VELOCITY,
} from "@arrowfall/shared";
import { applyShoot } from "../archer/shoot.js";
import { stepArcher } from "../archer/step.js";
import {
  ARCHER_HITBOX_H,
  ARCHER_HITBOX_W,
  type Archer,
} from "../archer/types.js";
import { dropArrowsOnDeath } from "../arrow/drop.js";
import { stepArrow } from "../arrow/step.js";
import { type Arrow, arrowAabb } from "../arrow/types.js";
import { type World, type WorldEvent } from "./types.js";

const archerBodyAabb = (a: Archer): AABB => ({
  x: a.pos.x,
  y: a.pos.y,
  w: ARCHER_HITBOX_W,
  h: ARCHER_HITBOX_H,
});

// Spec §2.6 — head hitbox = top 3 px of the body. Stomp target.
const archerHeadAabb = (a: Archer): AABB => ({
  x: a.pos.x,
  y: a.pos.y,
  w: ARCHER_HITBOX_W,
  h: HEAD_HITBOX_H,
});

const sortById = <T extends { readonly id: string }>(xs: ReadonlyArray<T>): T[] =>
  [...xs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

// Pure: returns a fresh World with this frame's events.
//
// Order of operations is load-bearing for determinism (client prediction
// must agree with the server). Steps:
//
//   1. Snapshot archer ids in alphabetical order. Every iteration below
//      walks this same sorted list — JS Map insertion order is *not*
//      relied upon during stepping.
//   2. applyShoot per archer → list of new arrows. Each new arrow's id
//      uses `${ownerId}-arrow-${tick}` (one shot per archer per frame).
//   3. stepArcher per archer (advances physics + decrements timers).
//   4. stepArrow per existing arrow (sorted by id).
//   5. Resolve arrow ↔ archer collisions:
//        - Skip if friendly fire with self.
//        - spawnIframeTimer > 0 → arrow passes through (no event).
//        - dodgeIframeTimer > 0 → catch (inventory++, arrow removed).
//          Catch reuses the *same* dodgeIframeTimer as iframes — they
//          intentionally share a window so a successful dodge is also
//          a catch attempt; spec §2.4 calls this out.
//        - else → kill (alive=false, deathTimer=0, arrow embeds at
//          impact with the standard 10-frame pickup delay).
//   6. Stomp: for each pair (A, B) of distinct alive archers in sorted
//      order, if A.vel.y > 0 AND head(B) ∩ body(A): B dies, A bounces
//      (vy = STOMP_BOUNCE_VELOCITY). spawnIframe / dodgeIframe on B
//      cancels the stomp (same iframe rule as arrows for consistency).
//   7. Pickup: each archer scans grounded/embedded arrows whose
//      groundedTimer === 0; on overlap, inventory++ (clamped at
//      MAX_INVENTORY) and the arrow is removed.
//   8. Drop: each newly killed archer ejects its inventory via
//      dropArrowsOnDeath (deterministic fan, no PRNG).
//   9. Despawn dead archers whose deathTimer >= DEATH_DURATION_FRAMES.
//  10. tick++.
//
// SPIKE handling: Phase 2 left SPIKE non-blocking for the archer body
// (the player does not collide with it, only the engine "knows" the
// tile is lethal). For Phase 3 we leave that as-is — wiring spike-kill
// adds a second probe loop and a 'spike' kill-event branch but no new
// netcode surface; deferred to Phase 4. The 'spike' cause exists in the
// event union so Phase 4 can plug in without a schema bump.
export const stepWorld = (
  world: World,
  inputs: ReadonlyMap<string, ArcherInput>,
): World => {
  const tick = world.tick;
  const events: WorldEvent[] = [];

  // 1. Stable iteration order.
  const sortedIds = [...world.archers.keys()].sort();

  // 2. Shoot phase. Each archer fires at most once per frame; the id
  //    suffix is just `${tick}` since `${ownerId}` already namespaces it.
  const newArrows: Arrow[] = [];
  const afterShoot = new Map<string, Archer>();
  for (const id of sortedIds) {
    const a = world.archers.get(id)!;
    const input = inputs.get(id) ?? NEUTRAL_INPUT;
    const result = applyShoot(a, input, `${tick}`);
    afterShoot.set(id, result.archer);
    if (result.newArrow !== null) {
      newArrows.push(result.newArrow);
      events.push({
        kind: "arrow-fired",
        arrowId: result.newArrow.id,
        ownerId: id,
        tick,
      });
    }
  }

  // 3. Step each archer (physics + timers).
  const afterStep = new Map<string, Archer>();
  for (const id of sortedIds) {
    const a = afterShoot.get(id)!;
    const input = inputs.get(id) ?? NEUTRAL_INPUT;
    afterStep.set(id, stepArcher(a, input, world.map));
  }

  // 4. Step each existing arrow (sorted by id for stable iteration).
  const sortedArrows = sortById(world.arrows);
  const arrowsNow: Arrow[] = sortedArrows.map((a) => stepArrow(a, world.map));

  // 5–7 work on a mutable working map / array; we re-build the
  // immutable World at the end.
  const archerNow = new Map<string, Archer>();
  for (const id of sortedIds) archerNow.set(id, afterStep.get(id)!);

  const removedArrowIds = new Set<string>();
  const killedArchers: Archer[] = [];

  // 5. Arrow ↔ archer collisions (death / catch).
  for (const archerId of sortedIds) {
    let archer = archerNow.get(archerId)!;
    if (!archer.alive) continue;

    for (let i = 0; i < arrowsNow.length; i++) {
      const arrow = arrowsNow[i]!;
      if (arrow.status !== "flying") continue;
      if (removedArrowIds.has(arrow.id)) continue;
      if (arrow.ownerId === archerId) continue;
      if (!aabbIntersects(archerBodyAabb(archer), arrowAabb(arrow))) continue;

      if (archer.spawnIframeTimer > 0) {
        // Spawn iframe — arrow passes through silently.
        continue;
      }

      if (archer.dodgeIframeTimer > 0) {
        // Catch: +1 inventory clamped, arrow removed, event emitted.
        archer = {
          ...archer,
          inventory: Math.min(MAX_INVENTORY, archer.inventory + 1),
        };
        archerNow.set(archerId, archer);
        removedArrowIds.add(arrow.id);
        events.push({
          kind: "arrow-caught",
          arrowId: arrow.id,
          catcherId: archerId,
          tick,
        });
        // Continue checking other arrows — multiple simultaneous hits
        // during a dodge are all caught (TowerFall behaviour).
        continue;
      }

      // Kill. Embed the arrow at impact with the standard pickup delay
      // so the killer cannot scoop it up the very next frame.
      archer = { ...archer, alive: false, deathTimer: 0 };
      archerNow.set(archerId, archer);
      arrowsNow[i] = {
        ...arrow,
        status: "embedded",
        vel: { x: 0, y: 0 },
        groundedTimer: ARROW_GROUNDED_PICKUP_DELAY,
      };
      killedArchers.push(archer);
      events.push({
        kind: "archer-killed",
        victimId: archerId,
        cause: "arrow",
        killerId: arrow.ownerId,
        tick,
      });
      // Dead archers don't take more hits this frame.
      break;
    }
  }

  // 6. Stomp.
  for (const aId of sortedIds) {
    const a = archerNow.get(aId)!;
    if (!a.alive) continue;
    if (a.vel.y <= 0) continue; // must be falling

    const bodyA = archerBodyAabb(a);

    for (const bId of sortedIds) {
      if (aId === bId) continue;
      const b = archerNow.get(bId)!;
      if (!b.alive) continue;
      // Iframe rule mirrors arrows: a dodging or freshly-spawned target
      // cannot be stomped. Keeps the "iframe = total invulnerability"
      // invariant clean across all damage sources.
      if (b.spawnIframeTimer > 0 || b.dodgeIframeTimer > 0) continue;

      if (!aabbIntersects(bodyA, archerHeadAabb(b))) continue;

      archerNow.set(aId, {
        ...a,
        vel: { x: a.vel.x, y: STOMP_BOUNCE_VELOCITY },
      });
      const dead = { ...b, alive: false, deathTimer: 0 };
      archerNow.set(bId, dead);
      killedArchers.push(dead);
      events.push({
        kind: "archer-killed",
        victimId: bId,
        cause: "stomp",
        killerId: aId,
        tick,
      });
    }
  }

  // 7. Pickup.
  for (const archerId of sortedIds) {
    let archer = archerNow.get(archerId)!;
    if (!archer.alive) continue;
    if (archer.inventory >= MAX_INVENTORY) continue;

    for (const arrow of arrowsNow) {
      if (removedArrowIds.has(arrow.id)) continue;
      if (arrow.status !== "grounded" && arrow.status !== "embedded") continue;
      if (arrow.groundedTimer > 0) continue;
      if (!aabbIntersects(archerBodyAabb(archer), arrowAabb(arrow))) continue;

      archer = {
        ...archer,
        inventory: Math.min(MAX_INVENTORY, archer.inventory + 1),
      };
      archerNow.set(archerId, archer);
      removedArrowIds.add(arrow.id);
      events.push({
        kind: "arrow-picked-up",
        arrowId: arrow.id,
        pickerId: archerId,
        tick,
      });

      if (archer.inventory >= MAX_INVENTORY) break;
    }
  }

  // 8. Drop arrows for archers that died this frame. The drop happens
  //    AFTER pickup so a player who walks onto a corpse doesn't
  //    instantly grab the very arrows that just spawned (they're flying
  //    initially, so pickup wouldn't apply anyway, but ordering it last
  //    is conceptually cleaner).
  const dropArrows: Arrow[] = [];
  for (const dead of killedArchers) {
    const drops = dropArrowsOnDeath(dead, `${dead.id}-death-${tick}`);
    dropArrows.push(...drops);
    // Zero out inventory so the dead body doesn't appear to still hold
    // arrows in any HUD/snapshot.
    archerNow.set(dead.id, { ...archerNow.get(dead.id)!, inventory: 0 });
  }

  // 9. Despawn fully-aged corpses.
  const finalArchers = new Map<string, Archer>();
  for (const id of sortedIds) {
    const updated = archerNow.get(id)!;
    if (!updated.alive && updated.deathTimer >= DEATH_DURATION_FRAMES) continue;
    finalArchers.set(id, updated);
  }

  // 10. Build final arrows list and bump tick.
  const finalArrows: Arrow[] = [
    ...arrowsNow.filter((a) => !removedArrowIds.has(a.id)),
    ...newArrows,
    ...dropArrows,
  ];

  return {
    map: world.map,
    archers: finalArchers,
    arrows: finalArrows,
    tick: tick + 1,
    events,
  };
};

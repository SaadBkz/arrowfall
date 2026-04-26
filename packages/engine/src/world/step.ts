import {
  type AABB,
  type ArcherInput,
  aabbIntersects,
  ARROW_GROUNDED_PICKUP_DELAY,
  BOMB_RADIUS_PX,
  CHEST_OPEN_DURATION_FRAMES,
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
import { type Chest, chestAabb } from "../chest/types.js";
import { stepChest } from "../chest/step.js";
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

// Square AABB centered on (cx, cy) with half-side r. We use the bomb's
// arrow position (top-left of the 8×2 hitbox) as the centre — the
// 4-pixel bias is well below the radius, so it doesn't matter.
const explosionAabb = (cx: number, cy: number, r: number): AABB => ({
  x: cx - r,
  y: cy - r,
  w: r * 2,
  h: r * 2,
});

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
//   4. stepArrow per existing arrow (sorted by id). Phase 9a: bomb
//      arrows can transition to status="exploding" here.
//   5. Resolve bomb explosions (Phase 9a) — for every arrow now in the
//      "exploding" state, kill all alive archers intersecting the
//      blast AABB (modulo iframes), emit a bomb-exploded event, and
//      mark the arrow for removal. Done BEFORE archer/arrow collisions
//      so a bomb landing on an archer kills via explosion, not via the
//      arrow's flying-impact code path (the bomb is no longer flying).
//   6. Resolve arrow ↔ archer collisions (normal arrow flying impacts).
//   7. Stomp (bouncing on heads).
//   8. Pickup (grounded/embedded arrows). Phase 9a: arrow.type drives
//      which inventory counter is incremented.
//   9. Chests (Phase 9a): stepChest decrements openTimer; closed chests
//      check for an alive-archer overlap to trigger the open animation;
//      mid-open chests with openTimer === 0 deliver loot to the opener.
//  10. Drop arrows for archers that died this frame (deterministic fan).
//  11. Despawn dead archers whose deathTimer >= DEATH_DURATION_FRAMES.
//  12. Build final arrows / chests, bump tick.
//
// SPIKE handling: Phase 2 left SPIKE non-blocking for the archer body
// (the player does not collide with it, only the engine "knows" the
// tile is lethal). For Phase 3+ we leave that as-is — wiring spike-kill
// adds a second probe loop and a 'spike' kill-event branch but no new
// netcode surface; deferred. The 'spike' cause exists in the event
// union so a future wiring can plug in without a schema bump.
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

  // 5–8 work on a mutable working map / array; we re-build the
  // immutable World at the end.
  const archerNow = new Map<string, Archer>();
  for (const id of sortedIds) archerNow.set(id, afterStep.get(id)!);

  const removedArrowIds = new Set<string>();
  const killedArchers: Archer[] = [];

  // 5. Bomb explosions. Process in id order so events stay deterministic
  //    when several bombs detonate the same frame. An archer caught in
  //    multiple blasts the same tick still dies once (subsequent
  //    explosions skip dead archers).
  for (const arrow of arrowsNow) {
    if (arrow.status !== "exploding") continue;
    if (removedArrowIds.has(arrow.id)) continue;

    const blast = explosionAabb(arrow.pos.x, arrow.pos.y, BOMB_RADIUS_PX);
    for (const archerId of sortedIds) {
      let archer = archerNow.get(archerId)!;
      if (!archer.alive) continue;
      // iframes (spawn / dodge) absorb the explosion, same rule as
      // direct hits — keeps the "iframe = total invulnerability"
      // invariant consistent across damage sources.
      if (archer.spawnIframeTimer > 0) continue;
      if (archer.dodgeIframeTimer > 0) continue;
      if (!aabbIntersects(blast, archerBodyAabb(archer))) continue;

      archer = { ...archer, alive: false, deathTimer: 0 };
      archerNow.set(archerId, archer);
      killedArchers.push(archer);
      events.push({
        kind: "archer-killed",
        victimId: archerId,
        cause: "bomb",
        killerId: arrow.ownerId,
        tick,
      });
    }
    removedArrowIds.add(arrow.id);
    events.push({
      kind: "bomb-exploded",
      arrowId: arrow.id,
      ownerId: arrow.ownerId,
      x: arrow.pos.x,
      y: arrow.pos.y,
      tick,
    });
  }

  // 6. Arrow ↔ archer collisions (death / catch). Bombs in flight count
  //    too: a hit catches/kills with the same rules. (Bombs that already
  //    exploded are status="exploding" and were filtered above.)
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
        // Catch: +1 to the matching inventory slot, arrow removed,
        // event emitted. Catching a bomb is a great defensive move
        // (you now hold an explosive you can throw back).
        archer = applyCatchToInventory(archer, arrow);
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

  // 7. Stomp.
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

  // 8. Pickup. Type-aware: a grounded bomb (rare — they normally
  //    explode rather than land — but possible if it grounded before
  //    Phase 9a in a save state, or via a future arrow type) bumps
  //    bombInventory; everything else bumps the normal counter.
  for (const archerId of sortedIds) {
    let archer = archerNow.get(archerId)!;
    if (!archer.alive) continue;

    for (const arrow of arrowsNow) {
      if (removedArrowIds.has(arrow.id)) continue;
      if (arrow.status !== "grounded" && arrow.status !== "embedded") continue;
      if (arrow.groundedTimer > 0) continue;
      // Per-type cap: each inventory slot maxes at MAX_INVENTORY.
      // Skip if the matching slot is already full.
      const slotFull =
        arrow.type === "bomb"
          ? archer.bombInventory >= MAX_INVENTORY
          : archer.inventory >= MAX_INVENTORY;
      if (slotFull) continue;
      if (!aabbIntersects(archerBodyAabb(archer), arrowAabb(arrow))) continue;

      archer = applyCatchToInventory(archer, arrow);
      archerNow.set(archerId, archer);
      removedArrowIds.add(arrow.id);
      events.push({
        kind: "arrow-picked-up",
        arrowId: arrow.id,
        pickerId: archerId,
        tick,
      });
    }
  }

  // 9. Chests (Phase 9a). Step timers, then in this same pass:
  //    closed → opening when an alive archer overlaps;
  //    opening + timer=0 → deliver loot + emit event + remove.
  //
  //    Stable iteration order: chests are sorted by id, archer
  //    contact-check walks sortedIds. Loot is added to the opener at
  //    delivery time only; if the opener died between trigger and
  //    delivery, the chest is still consumed but no inventory bump.
  // `world.chests` is required by the type but tests routinely build
  // World stubs without it — coalescing keeps stepWorld backward-
  // compatible for those harnesses while production code (createWorld
  // + the server) always supplies an array.
  const chestsInput: ReadonlyArray<Chest> = world.chests ?? [];
  const chestsNow: Chest[] = sortById(chestsInput).map((c) => stepChest(c));
  const removedChestIds = new Set<string>();

  for (let ci = 0; ci < chestsNow.length; ci++) {
    let chest = chestsNow[ci]!;
    if (chest.status === "closed") {
      const aabb = chestAabb(chest);
      for (const archerId of sortedIds) {
        const archer = archerNow.get(archerId)!;
        if (!archer.alive) continue;
        if (!aabbIntersects(aabb, archerBodyAabb(archer))) continue;
        chest = {
          ...chest,
          status: "opening",
          openTimer: CHEST_OPEN_DURATION_FRAMES,
          openerId: archerId,
        };
        chestsNow[ci] = chest;
        break;
      }
    }
    // After (possibly) flipping to opening, check if delivery is due.
    if (chest.status === "opening" && chest.openTimer === 0) {
      const openerId = chest.openerId;
      if (openerId !== null) {
        const opener = archerNow.get(openerId);
        if (opener !== undefined && opener.alive) {
          const after = applyChestLootToInventory(opener, chest.contents);
          archerNow.set(openerId, after);
        }
      }
      events.push({
        kind: "chest-opened",
        chestId: chest.id,
        openerId: openerId ?? "",
        x: chest.pos.x,
        y: chest.pos.y,
        tick,
      });
      removedChestIds.add(chest.id);
    }
  }

  // 10. Drop arrows for archers that died this frame. The drop happens
  //     AFTER pickup so a player who walks onto a corpse doesn't
  //     instantly grab the very arrows that just spawned (they're flying
  //     initially, so pickup wouldn't apply anyway, but ordering it last
  //     is conceptually cleaner).
  const dropArrows: Arrow[] = [];
  for (const dead of killedArchers) {
    const drops = dropArrowsOnDeath(dead, `${dead.id}-death-${tick}`);
    dropArrows.push(...drops);
    // Zero out inventory so the dead body doesn't appear to still hold
    // arrows in any HUD/snapshot.
    archerNow.set(dead.id, {
      ...archerNow.get(dead.id)!,
      inventory: 0,
      bombInventory: 0,
    });
  }

  // 11. Despawn fully-aged corpses.
  const finalArchers = new Map<string, Archer>();
  for (const id of sortedIds) {
    const updated = archerNow.get(id)!;
    if (!updated.alive && updated.deathTimer >= DEATH_DURATION_FRAMES) continue;
    finalArchers.set(id, updated);
  }

  // 12. Build final arrows / chests list and bump tick.
  const finalArrows: Arrow[] = [
    ...arrowsNow.filter((a) => !removedArrowIds.has(a.id)),
    ...newArrows,
    ...dropArrows,
  ];
  const finalChests: Chest[] = chestsNow.filter((c) => !removedChestIds.has(c.id));

  return {
    map: world.map,
    archers: finalArchers,
    arrows: finalArrows,
    chests: finalChests,
    tick: tick + 1,
    events,
  };
};

// Helper: handle pickup OR catch of an arrow — both bump the matching
// inventory slot and clamp at MAX_INVENTORY. Centralised so the pickup
// loop and catch branch can't drift on the cap rule.
const applyCatchToInventory = (archer: Archer, arrow: Arrow): Archer => {
  if (arrow.type === "bomb") {
    return {
      ...archer,
      bombInventory: Math.min(MAX_INVENTORY, archer.bombInventory + 1),
    };
  }
  return {
    ...archer,
    inventory: Math.min(MAX_INVENTORY, archer.inventory + 1),
  };
};

// Helper: deliver chest loot to an opener's inventory. Per-type cap at
// MAX_INVENTORY (overflow drops are silently lost — Phase 9a accepts
// this; a Phase 9b inventory rework with a typed stack would surface
// the same behaviour without the dual counter).
const applyChestLootToInventory = (
  archer: Archer,
  contents: { readonly type: Arrow["type"]; readonly count: number },
): Archer => {
  if (contents.count <= 0) return archer;
  if (contents.type === "bomb") {
    return {
      ...archer,
      bombInventory: Math.min(MAX_INVENTORY, archer.bombInventory + contents.count),
    };
  }
  return {
    ...archer,
    inventory: Math.min(MAX_INVENTORY, archer.inventory + contents.count),
  };
};

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
import { type Chest, type ChestContents, chestAabb } from "../chest/types.js";
import { stepChest } from "../chest/step.js";
import { type ArcherKillCause, type World, type WorldEvent } from "./types.js";

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
//   2. applyShoot per archer → list of new arrows.
//   3. stepArcher per archer (advances physics + decrements timers).
//   4. stepArrow per existing arrow (sorted by id). Bombs flip to
//      "exploding" here on fuse / wall hit; lasers despawn (also via
//      "exploding") on bounce-cap or lifetime.
//   5. Resolve arrows in status="exploding":
//        - bomb → blast AABB, kill alive archers in range (or break
//          their shield). Emits bomb-exploded + per-victim events.
//        - laser → silent removal (no event).
//      Done BEFORE arrow/archer collisions so a bomb landing on an
//      archer kills via explosion, not via the arrow's flying-impact
//      code path.
//   6. Resolve arrow ↔ archer collisions (flying-arrow direct hits).
//      Phase 9b: shield absorbs the hit and breaks (no death).
//   7. Stomp (bouncing on heads). Phase 9b: shield absorbs the stomp
//      kill (the stomper still bounces — only the victim's shield is
//      consumed, since the stomp itself was a deflected attack).
//   8. Pickup of grounded/embedded arrows. Type-aware: each ArrowType
//      bumps its matching inventory counter.
//   9. Chests: stepChest decrements openTimer; closed chests check
//      for an alive-archer overlap to trigger the open animation;
//      mid-open chests with openTimer === 0 deliver loot to the
//      opener (ChestContents discriminated union: arrows vs shield).
//  10. Drop arrows for archers that died this frame (deterministic fan).
//  11. Despawn dead archers whose deathTimer >= DEATH_DURATION_FRAMES.
//  12. Build final arrows / chests, bump tick.
//
// SPIKE handling: still non-blocking for the archer body (Phase 2
// behaviour). The 'spike' kill cause exists in the event union for a
// future wiring pass without a schema bump.
export const stepWorld = (
  world: World,
  inputs: ReadonlyMap<string, ArcherInput>,
): World => {
  const tick = world.tick;
  const events: WorldEvent[] = [];

  // 1. Stable iteration order.
  const sortedIds = [...world.archers.keys()].sort();

  // 2. Shoot phase.
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

  const archerNow = new Map<string, Archer>();
  for (const id of sortedIds) archerNow.set(id, afterStep.get(id)!);

  const removedArrowIds = new Set<string>();
  const killedArchers: Archer[] = [];

  // 5. Bomb explosions / laser despawns. Process in id order.
  for (const arrow of arrowsNow) {
    if (arrow.status !== "exploding") continue;
    if (removedArrowIds.has(arrow.id)) continue;

    if (arrow.type === "laser") {
      // Laser lifetime / bounce-cap exhausted — silent removal.
      removedArrowIds.add(arrow.id);
      continue;
    }

    // Bomb (or any future explode-type): resolve the blast.
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

      // Phase 9b — shield absorbs the explosion: archer survives,
      // shield consumed, shield-broken event emitted instead of
      // archer-killed. Friendly fire still applies (a player caught
      // in their own bomb's blast loses their shield).
      if (archer.hasShield) {
        archer = { ...archer, hasShield: false };
        archerNow.set(archerId, archer);
        events.push({
          kind: "shield-broken",
          victimId: archerId,
          cause: "bomb",
          tick,
        });
        continue;
      }

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

  // 6. Arrow ↔ archer collisions (death / catch / shield).
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
        // event emitted. Catching a special is great defensively
        // (you now hold the same explosive/drill/laser to throw back).
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

      // Phase 9b — shield absorbs the hit. Arrow still gets embedded
      // (arrow is consumed by the impact, same as a normal kill) but
      // the archer survives without their shield.
      if (archer.hasShield) {
        archer = { ...archer, hasShield: false };
        archerNow.set(archerId, archer);
        arrowsNow[i] = {
          ...arrow,
          status: "embedded",
          vel: { x: 0, y: 0 },
          groundedTimer: ARROW_GROUNDED_PICKUP_DELAY,
        };
        events.push({
          kind: "shield-broken",
          victimId: archerId,
          cause: "arrow",
          tick,
        });
        // Shield is gone — but we keep iterating arrows because a
        // simultaneous *second* arrow this frame would now kill the
        // un-shielded archer. Without this loop continue, two arrows
        // in the same tick could both whiff harmlessly.
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

      // Stomper always bounces, even on a shielded target — the kick
      // off the head is mechanical, regardless of whether the target
      // dies.
      archerNow.set(aId, {
        ...a,
        vel: { x: a.vel.x, y: STOMP_BOUNCE_VELOCITY },
      });

      // Phase 9b — shield absorbs the stomp.
      if (b.hasShield) {
        archerNow.set(bId, { ...b, hasShield: false });
        events.push({
          kind: "shield-broken",
          victimId: bId,
          cause: "stomp",
          tick,
        });
        continue;
      }

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

  // 8. Pickup. Type-aware: each ArrowType bumps its matching counter.
  for (const archerId of sortedIds) {
    let archer = archerNow.get(archerId)!;
    if (!archer.alive) continue;

    for (const arrow of arrowsNow) {
      if (removedArrowIds.has(arrow.id)) continue;
      if (arrow.status !== "grounded" && arrow.status !== "embedded") continue;
      if (arrow.groundedTimer > 0) continue;
      if (slotFullFor(archer, arrow.type)) continue;
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

  // 9. Chests. Step timers, then in this same pass:
  //    closed → opening when an alive archer overlaps;
  //    opening + timer=0 → deliver loot + emit event + remove.
  //
  //    Stable iteration order: chests are sorted by id, archer
  //    contact-check walks sortedIds. Loot is added to the opener at
  //    delivery time only; if the opener died between trigger and
  //    delivery, the chest is still consumed but no inventory bump
  //    (and no shield grant).
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

  // 10. Drop arrows for archers that died this frame.
  const dropArrows: Arrow[] = [];
  for (const dead of killedArchers) {
    const drops = dropArrowsOnDeath(dead, `${dead.id}-death-${tick}`);
    dropArrows.push(...drops);
    // Zero out inventories so the dead body doesn't appear to still
    // hold arrows in any HUD/snapshot.
    archerNow.set(dead.id, {
      ...archerNow.get(dead.id)!,
      inventory: 0,
      bombInventory: 0,
      drillInventory: 0,
      laserInventory: 0,
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

// Per-type cap helper — each inventory slot maxes at MAX_INVENTORY.
const slotFullFor = (archer: Archer, type: Arrow["type"]): boolean => {
  switch (type) {
    case "bomb":
      return archer.bombInventory >= MAX_INVENTORY;
    case "drill":
      return archer.drillInventory >= MAX_INVENTORY;
    case "laser":
      return archer.laserInventory >= MAX_INVENTORY;
    case "normal":
    default:
      return archer.inventory >= MAX_INVENTORY;
  }
};

// Helper: handle pickup OR catch of an arrow — both bump the matching
// inventory slot and clamp at MAX_INVENTORY. Centralised so the pickup
// loop and catch branch can't drift on the cap rule.
const applyCatchToInventory = (archer: Archer, arrow: Arrow): Archer => {
  switch (arrow.type) {
    case "bomb":
      return {
        ...archer,
        bombInventory: Math.min(MAX_INVENTORY, archer.bombInventory + 1),
      };
    case "drill":
      return {
        ...archer,
        drillInventory: Math.min(MAX_INVENTORY, archer.drillInventory + 1),
      };
    case "laser":
      return {
        ...archer,
        laserInventory: Math.min(MAX_INVENTORY, archer.laserInventory + 1),
      };
    case "normal":
    default:
      return {
        ...archer,
        inventory: Math.min(MAX_INVENTORY, archer.inventory + 1),
      };
  }
};

// Helper: deliver chest loot to an opener's inventory. Discriminated
// on contents.kind:
//   - "arrows" : bumps the matching inventory slot, clamped at
//                MAX_INVENTORY (overflow is silently lost).
//   - "shield" : sets archer.hasShield=true (no-op if already true).
const applyChestLootToInventory = (
  archer: Archer,
  contents: ChestContents,
): Archer => {
  if (contents.kind === "shield") {
    return { ...archer, hasShield: true };
  }
  if (contents.count <= 0) return archer;
  switch (contents.type) {
    case "bomb":
      return {
        ...archer,
        bombInventory: Math.min(MAX_INVENTORY, archer.bombInventory + contents.count),
      };
    case "drill":
      return {
        ...archer,
        drillInventory: Math.min(MAX_INVENTORY, archer.drillInventory + contents.count),
      };
    case "laser":
      return {
        ...archer,
        laserInventory: Math.min(MAX_INVENTORY, archer.laserInventory + contents.count),
      };
    case "normal":
    default:
      return {
        ...archer,
        inventory: Math.min(MAX_INVENTORY, archer.inventory + contents.count),
      };
  }
};

// Re-export for type narrowing in archer-killed cause unions.
export type { ArcherKillCause };

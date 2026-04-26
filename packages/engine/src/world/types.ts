import { type MapData } from "@arrowfall/shared";
import { type Archer } from "../archer/types.js";
import { type Arrow } from "../arrow/types.js";
import { type Chest } from "../chest/types.js";

// Reasons an archer can die. SPIKE is wired up alongside arrow/stomp so
// the union is closed for Phase 3 callers, even if SPIKE handling is a
// thin pass-through (see notes in step.ts). Phase 9a adds 'bomb' for
// archers caught in an explosion radius.
export type ArcherKillCause = "arrow" | "stomp" | "spike" | "bomb";

// One-shot events emitted *for the current frame only*. Renderer / netcode
// consumes them to play SFX, spawn particles, update HUD; they do NOT
// persist across frames (each stepWorld returns a fresh list).
export type WorldEvent =
  | {
      readonly kind: "arrow-fired";
      readonly arrowId: string;
      readonly ownerId: string;
      readonly tick: number;
    }
  | {
      readonly kind: "arrow-caught";
      readonly arrowId: string;
      readonly catcherId: string;
      readonly tick: number;
    }
  | {
      readonly kind: "archer-killed";
      readonly victimId: string;
      readonly cause: ArcherKillCause;
      readonly killerId: string | null;
      readonly tick: number;
    }
  | {
      readonly kind: "arrow-picked-up";
      readonly arrowId: string;
      readonly pickerId: string;
      readonly tick: number;
    }
  // Phase 9a — Bomb arrow exploded. The center is the arrow's position
  // at the moment of the blast; the radius lives in shared constants
  // (BOMB_RADIUS_PX). Renderer plays the FX; netcode mirrors the event
  // for cross-client SFX.
  | {
      readonly kind: "bomb-exploded";
      readonly arrowId: string;
      readonly ownerId: string;
      readonly x: number;
      readonly y: number;
      readonly tick: number;
    }
  // Phase 9a — Chest opened. Loot has just been delivered to the
  // opener's inventory. Renderer plays the open animation + a small
  // "+N <type>" pickup toast (optional).
  | {
      readonly kind: "chest-opened";
      readonly chestId: string;
      readonly openerId: string;
      readonly x: number;
      readonly y: number;
      readonly tick: number;
    };

// World aggregate. `archers` is a Map keyed by id; iteration order is the
// JS Map insertion order. To stay deterministic, stepWorld always
// snapshots and walks the keys in *alphabetical id order* — never
// directly via Map iteration. createWorld inserts archers sorted by id
// for the same reason.
export type World = {
  readonly map: MapData;
  readonly archers: ReadonlyMap<string, Archer>;
  readonly arrows: ReadonlyArray<Arrow>;
  readonly chests: ReadonlyArray<Chest>;
  readonly tick: number;
  readonly events: ReadonlyArray<WorldEvent>;
};

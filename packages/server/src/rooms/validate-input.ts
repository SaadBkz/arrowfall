import { NEUTRAL_INPUT, type ArcherInput } from "@arrowfall/shared";

const DIRECTIONS = new Set(["N", "NE", "E", "SE", "S", "SW", "W", "NW"]);

const isBool = (v: unknown): v is boolean => typeof v === "boolean";

// Strict validator. Returns NEUTRAL_INPUT on any malformed payload — we
// don't want a single bad client to crash the room or inject undefined
// fields into the engine. Caller logs/rate-limits if needed; at this
// phase we just silently neutralize.
//
// Accepted shape (matches ArcherInput exactly):
//   { left/right/up/down/jump/dodge/jumpHeld/shoot: boolean,
//     aimDirection: "N"|"NE"|...|"NW"|null }
export const validateInput = (raw: unknown): ArcherInput => {
  if (raw === null || typeof raw !== "object") return NEUTRAL_INPUT;
  const r = raw as Record<string, unknown>;
  if (
    !isBool(r["left"]) ||
    !isBool(r["right"]) ||
    !isBool(r["up"]) ||
    !isBool(r["down"]) ||
    !isBool(r["jump"]) ||
    !isBool(r["dodge"]) ||
    !isBool(r["jumpHeld"]) ||
    !isBool(r["shoot"])
  ) {
    return NEUTRAL_INPUT;
  }
  const aim = r["aimDirection"];
  if (aim !== null && (typeof aim !== "string" || !DIRECTIONS.has(aim))) {
    return NEUTRAL_INPUT;
  }
  return {
    left: r["left"],
    right: r["right"],
    up: r["up"],
    down: r["down"],
    jump: r["jump"],
    dodge: r["dodge"],
    jumpHeld: r["jumpHeld"],
    shoot: r["shoot"],
    // Cast safe because we validated against DIRECTIONS above.
    aimDirection: aim as ArcherInput["aimDirection"],
  };
};

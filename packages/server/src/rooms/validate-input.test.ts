import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT, type ArcherInput } from "@arrowfall/shared";
import { validateInput } from "./validate-input.js";

const VALID: ArcherInput = {
  left: false,
  right: true,
  up: false,
  down: false,
  jump: true,
  dodge: false,
  jumpHeld: true,
  shoot: false,
  aimDirection: "E",
};

describe("validateInput", () => {
  it("accepts a well-formed payload and returns its values verbatim", () => {
    expect(validateInput(VALID)).toEqual(VALID);
  });

  it("accepts aimDirection: null", () => {
    const ok = { ...VALID, aimDirection: null };
    expect(validateInput(ok)).toEqual(ok);
  });

  it("returns NEUTRAL_INPUT for null", () => {
    expect(validateInput(null)).toEqual(NEUTRAL_INPUT);
  });

  it("returns NEUTRAL_INPUT for non-objects", () => {
    expect(validateInput("hello")).toEqual(NEUTRAL_INPUT);
    expect(validateInput(42)).toEqual(NEUTRAL_INPUT);
    expect(validateInput(true)).toEqual(NEUTRAL_INPUT);
  });

  it("rejects when any boolean field is missing", () => {
    const broken: Record<string, unknown> = { ...VALID };
    delete broken["jump"];
    expect(validateInput(broken)).toEqual(NEUTRAL_INPUT);
  });

  it("rejects when a boolean field has a non-boolean type", () => {
    expect(validateInput({ ...VALID, left: 1 })).toEqual(NEUTRAL_INPUT);
    expect(validateInput({ ...VALID, shoot: "true" })).toEqual(NEUTRAL_INPUT);
  });

  it("rejects an unknown aimDirection string", () => {
    expect(validateInput({ ...VALID, aimDirection: "ZZ" })).toEqual(NEUTRAL_INPUT);
  });

  it("rejects a numeric aimDirection", () => {
    expect(validateInput({ ...VALID, aimDirection: 0 })).toEqual(NEUTRAL_INPUT);
  });

  it("ignores extra fields without rejecting (forward-compat)", () => {
    expect(validateInput({ ...VALID, futureField: "ignored" })).toEqual(VALID);
  });
});

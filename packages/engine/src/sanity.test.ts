import { describe, it, expect } from "vitest";
import { VERSION } from "./index.js";

describe("engine sanity", () => {
  it("arithmetic works (toolchain check)", () => {
    expect(1 + 1).toBe(2);
  });

  it("exposes a VERSION constant", () => {
    expect(VERSION).toBe("0.0.1");
  });
});

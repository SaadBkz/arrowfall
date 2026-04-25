import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Tests are CPU-bound and don't share state — run in parallel
    // (vitest default). Single-threaded would only matter if a test
    // bound to port 2567, but we never start the actual transport.
    environment: "node",
    // The Colyseus clock is paused by default so setSimulationInterval
    // / setPatchRate don't fire during tests; no extra setup needed.
  },
});

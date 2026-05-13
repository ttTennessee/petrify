import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    include: ["src/**/*.test.ts"],
    testTimeout: 15_000,
    env: {
      PETRIFY_DB: ":memory:",
      PETRIFY_OTEL: "off",
    },
  },
});

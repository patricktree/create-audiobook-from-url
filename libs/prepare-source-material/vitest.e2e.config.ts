import { config as baseConfig } from "@patricktree-stack/config-vitest/vitest-base.js";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["test-e2e/**/*.test.ts"],
      testTimeout: 120_000,
      hookTimeout: 120_000,
    },
  }),
);

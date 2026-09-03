import { config as baseConfig } from "@patricktree-stack/config-vitest/vitest-base.js";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: ["test-vitest/**/*.test.ts"],
      hookTimeout: 30_000,
      testTimeout: 30_000,
    },
  }),
);

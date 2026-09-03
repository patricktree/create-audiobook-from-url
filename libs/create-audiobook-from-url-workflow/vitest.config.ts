import { config as baseConfig } from "@patricktree-stack/config-vitest/vitest-base.js";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      coverage: {
        thresholds: {
          branches: 54.54,
          functions: 12.5,
          lines: 17.39,
          statements: 17.39,
        },
      },
    },
  }),
);

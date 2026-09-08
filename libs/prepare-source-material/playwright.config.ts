import { createPlaywrightDockerConfig } from "@patricktree-stack/config-playwright/playwright-docker";
import { defineConfig } from "@playwright/test";

export default defineConfig(createPlaywrightDockerConfig({ maxWorkers: 2 }), {
  testDir: "./test-e2e",
  timeout: 120_000,
  outputDir: "./playwright-output/test-results",
  reporter: [["html", { open: "never", outputFolder: "./playwright-output/html-report" }]],
  // HTML baselines stay beside the tests rather than using platform-specific image paths.
  snapshotPathTemplate: "{testDir}/{arg}{ext}",
  use: {
    browserName: "chromium",
    trace: "retain-on-failure",
  },
});

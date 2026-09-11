import { defineConfig, mergeConfig } from "vite";

import { createWebAppViteConfig } from "@cup/web-app/vite";

export default mergeConfig(
  createWebAppViteConfig(),
  defineConfig({ build: { outDir: "dist/web" } }),
);

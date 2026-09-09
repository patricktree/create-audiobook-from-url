import { defineConfig, mergeConfig } from "vite";

import { createWebAppViteConfig } from "@create-audiobook-from-url/web-app/vite";

export default mergeConfig(
  createWebAppViteConfig(),
  defineConfig({ build: { outDir: "dist/web" } }),
);

import { defineConfig, mergeConfig } from "vite";

import { createWebAppViteConfig, WEB_APP_DIRECTORY } from "@create-audiobook-from-url/web-app/vite";

export default mergeConfig(
  createWebAppViteConfig(),
  defineConfig({
    root: WEB_APP_DIRECTORY,
    server: {
      port: 3100,
      strictPort: true,
    },
  }),
);

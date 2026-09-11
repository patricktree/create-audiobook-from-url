import { cloudflare } from "@cloudflare/vite-plugin";
import { check } from "@patricktree-stack/utils-ecma/assert.utils";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, mergeConfig } from "vite";

import { createWebAppViteConfig, WEB_APP_DIRECTORY } from "@cup/web-app/vite";

const WORKER_DIRECTORY = import.meta.dirname;

export default defineConfig(({ command }) => {
  const workerConfig = defineConfig({
    envDir: WORKER_DIRECTORY,
    build: { outDir: path.join(WORKER_DIRECTORY, "dist") },
    plugins: [cloudflare({ configPath: path.join(WORKER_DIRECTORY, "wrangler.jsonc") })],
  });

  if (command === "build") {
    const webBundleDirectory = path.join(WEB_APP_DIRECTORY, "dist/web");
    // The web package builds first through Turbo; never deploy without its SPA assets.
    fs.accessSync(path.join(webBundleDirectory, "index.html"));

    return mergeConfig(workerConfig, {
      root: WORKER_DIRECTORY,
      publicDir: webBundleDirectory,
    });
  } else if (command === "serve") {
    return mergeConfig(
      createWebAppViteConfig(),
      mergeConfig(workerConfig, {
        root: WEB_APP_DIRECTORY,
      }),
    );
  }

  return check.assertIsUnreachable(command);
});

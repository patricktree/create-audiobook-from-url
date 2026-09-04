import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import wyw from "@wyw-in-js/vite";
import path from "node:path";
import url from "node:url";
import { defineConfig } from "vite";

import { WEB_APP_CSP_NONCE_PLACEHOLDER } from "@create-audiobook-from-url/api-server/web-app-csp";

const WEB_APP_DIRECTORY = url.fileURLToPath(new URL("../web-app", import.meta.url));
const WYW_CONFIG_FILE = url.fileURLToPath(
  import.meta.resolve("@patricktree-stack/config-wyw-in-js/wyw-in-js.config.cjs"),
);

export default defineConfig({
  html: { cspNonce: WEB_APP_CSP_NONCE_PLACEHOLDER },
  publicDir: path.join(WEB_APP_DIRECTORY, "public"),
  plugins: [
    tanstackRouter({
      autoCodeSplitting: true,
      generatedRouteTree: path.join(WEB_APP_DIRECTORY, "src/routeTree.gen.ts"),
      routesDirectory: path.join(WEB_APP_DIRECTORY, "src/routes"),
      target: "react",
    }),
    wyw({
      configFile: WYW_CONFIG_FILE,
      keepComments: true,
    }),
    react(),
    cloudflare(),
  ],
  server: {
    allowedHosts: [
      /* patricktree tailscale domain */
      ".oberhasli-universe.ts.net",
    ],
    host: "127.0.0.1",
  },
});

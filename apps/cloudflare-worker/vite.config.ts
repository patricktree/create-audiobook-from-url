import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig, mergeConfig } from "vite";

import { WEB_APP_CSP_NONCE_PLACEHOLDER } from "@create-audiobook-from-url/api-server/web-app-csp";
import { createWebAppViteConfig } from "@create-audiobook-from-url/web-app/vite";

export default mergeConfig(
  createWebAppViteConfig(),
  defineConfig({
    html: { cspNonce: WEB_APP_CSP_NONCE_PLACEHOLDER },
    plugins: [cloudflare()],
  }),
);

import { defineConfig } from "oxlint";

import { config as baseConfig } from "@create-audiobook-from-url/config-oxlint/oxlint-base.js";

export default defineConfig({ extends: [baseConfig] });

import { defineConfig } from "oxlint";

import { config as repoConfig } from "@create-audiobook-from-url/config-oxlint/oxlint-base.js";

export default defineConfig({ extends: [repoConfig] });

const path = require("node:path");

import type { CapacitorConfig } from "@capacitor/cli";

const pathToWebApp = require.resolve("@create-audiobook-from-url/web-app/package.json");
const pathToWebAppDist = path.join(pathToWebApp, "..", "./dist/web");

const config: CapacitorConfig = {
  appId: "me.patricktree.createaudiobookfromurl",
  appName: "Create Audiobook from URL",
  webDir: pathToWebAppDist,
};

module.exports = config;

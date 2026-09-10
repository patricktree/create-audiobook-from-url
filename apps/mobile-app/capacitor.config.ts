const path = require("node:path");

import type {} from "@capacitor/app";
import type { CapacitorConfig } from "@capacitor/cli";

const pathToWebApp = require.resolve("@create-audiobook-from-url/web-app/package.json");
const pathToWebAppDist = path.join(pathToWebApp, "..", "./dist/web");

const config: CapacitorConfig = {
  appId: "me.patricktree.createaudiobookfromurl",
  appName: "Create Audiobook from URL",
  webDir: pathToWebAppDist,
  server: { appStartPath: "/app/" },
  plugins: { CapacitorHttp: { enabled: true }, App: { disableBackButtonHandler: false } },
};

module.exports = config;

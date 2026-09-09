import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import React from "react";
import ReactDOM from "react-dom/client";

import { AppStyles } from "#src/app/app-styles.js";
import { createAppRouter, GlobalProviders } from "#src/app/global-providers.js";
import { initializeAndroidAppLinks } from "#src/platform/app-links.android.js";
import { initializeAndroidShare } from "#src/platform/share-plugin.android.js";
import { settingsStorage } from "#src/settings-storage.js";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Expected #root element to exist.");
}

const router = createAppRouter();

if (Capacitor.getPlatform() === "android") {
  await App.addListener("backButton", () => {
    if (router.history.canGoBack()) {
      router.history.back();
    } else {
      void App.minimizeApp();
    }
  });
}

await Promise.all([
  initializeAndroidAppLinks((href) => router.history.push(href)).catch((error: unknown) => {
    console.error("Failed to initialize Android App Links", error);
  }),
  initializeAndroidShare(() => {
    const settings = settingsStorage.load();
    if (settings !== null) {
      void router.navigate({ to: "/trials/$grantId", params: { grantId: settings.lastGrantId } });
    }
  }).catch((error: unknown) => {
    console.error("Failed to initialize Android share intake", error);
  }),
]);

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppStyles />
    <GlobalProviders router={router} />
  </React.StrictMode>,
);

import { Capacitor } from "@capacitor/core";

import { WebAppApiClient } from "@cup/web-app-api.client";

const BACKEND_ORIGIN = "https://cup-audio.com";

export function createAppApiClient(): WebAppApiClient {
  return new WebAppApiClient(
    Capacitor.isNativePlatform() ? BACKEND_ORIGIN : window.location.origin,
  );
}

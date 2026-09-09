import { Capacitor } from "@capacitor/core";

import { WebAppApiClient } from "@create-audiobook-from-url/web-app-api.client";

const BACKEND_ORIGIN = "https://create-audiobook-from-url.patricktree.me";

export function createAppApiClient(): WebAppApiClient {
  return new WebAppApiClient(
    Capacitor.isNativePlatform() ? BACKEND_ORIGIN : window.location.origin,
  );
}

import { Capacitor } from "@capacitor/core";

import { WebAppApiClient } from "@create-audiobook-from-url/web-app-api.client";

import { grantSessionStorage } from "#src/grant-session-storage.js";

const BACKEND_ORIGIN = "https://create-audiobook-from-url.patricktree.me";

export function usesBearerSession(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export function createAppApiClient(): WebAppApiClient {
  return usesBearerSession()
    ? new WebAppApiClient(BACKEND_ORIGIN, authenticatedFetch)
    : new WebAppApiClient(window.location.origin);
}

const authenticatedFetch: typeof fetch = (input, init) => {
  const request = new Request(input, { ...init, credentials: "omit", redirect: "error" });
  const session = grantSessionStorage.load();
  if (session !== null) request.headers.set("Authorization", `Bearer ${session.token}`);
  return fetch(request);
};

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

import { extractSharedUrl } from "#src/platform/shared-url.js";

type AndroidSharePlugin = {
  addListener(
    eventName: "shareIntentReceived",
    listener: (payload: { text: string }) => void,
  ): Promise<PluginListenerHandle>;
};

const androidSharePlugin = registerPlugin<AndroidSharePlugin>("AndroidShare");
let pendingUrl: string | undefined;
let formListener: ((url: string) => void) | undefined;

export async function initializeAndroidShare(onShare: () => void): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return;
  }

  await androidSharePlugin.addListener("shareIntentReceived", ({ text }) => {
    const url = extractSharedUrl(text);
    if (url === undefined) {
      return;
    }
    pendingUrl = url;
    onShare();
    deliverPendingUrl();
  });
}

export function subscribeToSharedUrl(listener: (url: string) => void): () => void {
  formListener = listener;
  deliverPendingUrl();
  return () => {
    formListener = undefined;
  };
}

function deliverPendingUrl(): void {
  if (formListener === undefined || pendingUrl === undefined) {
    return;
  }
  const url = pendingUrl;
  pendingUrl = undefined;
  formListener(url);
}

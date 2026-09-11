import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

import { handleAppLink } from "#src/platform/app-links.js";

type AndroidAppLinksPlugin = {
  addListener(
    eventName: "appLinkReceived",
    listener: (payload: { url: string }) => void,
  ): Promise<PluginListenerHandle>;
};

const androidAppLinksPlugin = registerPlugin<AndroidAppLinksPlugin>("AndroidAppLinks");

export async function initializeAndroidAppLinks(navigate: (href: string) => void): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return;
  }

  await androidAppLinksPlugin.addListener("appLinkReceived", ({ url }) => {
    handleAppLink(url, navigate);
  });
}

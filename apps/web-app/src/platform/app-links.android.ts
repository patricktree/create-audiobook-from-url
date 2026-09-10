import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

type AndroidAppLinksPlugin = {
  addListener(
    eventName: "appLinkReceived",
    listener: (payload: { url: string }) => void,
  ): Promise<PluginListenerHandle>;
};

const androidAppLinksPlugin = registerPlugin<AndroidAppLinksPlugin>("AndroidAppLinks");
const APP_ORIGIN = "https://create-audiobook-from-url.patricktree.me";

export async function initializeAndroidAppLinks(navigate: (href: string) => void): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") {
    return;
  }

  await androidAppLinksPlugin.addListener("appLinkReceived", ({ url }) => {
    const parsed = URL.parse(url);
    if (parsed === null || parsed.origin !== APP_ORIGIN || parsed.username || parsed.password) {
      return;
    }
    if (
      parsed.pathname !== "/" &&
      !parsed.pathname.startsWith("/trials/") &&
      !parsed.pathname.startsWith("/conversions/") &&
      !parsed.pathname.startsWith("/audiobooks/")
    ) {
      return;
    }
    // Keep query parameters and the trial credential fragment when changing origins.
    navigate(parsed.pathname + parsed.search + parsed.hash);
  });
}

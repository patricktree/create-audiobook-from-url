# Mobile app

Capacitor shells for Android and iOS, based on Content Relay's `apps/mobile-app`. Both package the shared web app from `apps/web-app/dist/web` under the app ID `me.patricktree.createaudiobookfromurl`.

## Build

From the repository root:

```sh
pnpm --filter '@create-audiobook-from-url/mobile-app' build
```

This runs the cached shared web build and Capacitor configuration check, then syncs web assets into both native projects. Sync runs outside Turbo and always executes, even when both build tasks hit the cache.

The repository-wide `pnpm build` and `pnpm validate` run `turbo:build` without syncing native projects. Use the mobile package's `build` command above before building or installing a native app.

To sync an already built web bundle:

```sh
pnpm --filter '@create-audiobook-from-url/mobile-app' native:sync
```

## Android locally

Install Android Studio with SDK platform 36 and Java 21. Set `JAVA_HOME` to a Java 21 installation; Android Studio on macOS includes one at `/Applications/Android Studio.app/Contents/jbr/Contents/Home`.

Create the ignored file `apps/mobile-app/android/local.properties` with your SDK path:

```properties
sdk.dir=/Users/your-user/Library/Android/sdk
```

Start an Android emulator in Android Studio, or connect a device with USB debugging enabled. Confirm it appears in `adb devices`. Build the web bundle with the command above, then run:

```sh
cd apps/mobile-app/android
./gradlew assembleDebug testDebugUnitTest lintDebug installDebug
adb shell am start -n me.patricktree.createaudiobookfromurl/.MainActivity
```

The debug APK is written to `apps/mobile-app/android/app/build/outputs/apk/debug/app-debug.apk`. Confirm the landing page renders and the app can close and reopen without a crash.

## iOS

After building, open `apps/mobile-app/ios/App/App.xcodeproj` in Xcode and choose a simulator or configure signing for a device. The project uses Swift Package Manager, matching Content Relay.

## Android App Links and sharing

The Android app accepts shared plain text containing an HTTP or HTTPS URL and fills the conversion form without submitting it. It reopens the last trial whose credential was successfully exchanged in the app. If no trial is remembered, the shared URL waits until a conversion form is opened.

HTTPS links to `/app` and `/app/…` on `create-audiobook-from-url.patricktree.me` open the matching route in the app after Android verifies the domain association. API and download URLs are excluded from App Links. Paths, query parameters, and fragments are preserved, including trial credentials. Both cold starts and links delivered to an already running app are handled. Normal Capacitor launches start at `/app/`.

Deploy the web app so `https://create-audiobook-from-url.patricktree.me/.well-known/assetlinks.json` serves the file from `apps/web-app/public/.well-known/assetlinks.json` as JSON, without redirects. That file trusts Patrick's local Android debug certificate. A release or Play Store build requires its signing certificate's SHA-256 fingerprint to be added before deployment; another machine's debug certificate will also differ.

After deploying the association file and installing the rebuilt APK, request verification and inspect the result:

```sh
adb shell pm verify-app-links --re-verify me.patricktree.createaudiobookfromurl
adb shell pm get-app-links me.patricktree.createaudiobookfromurl
```

Verification is asynchronous. Wait until the domain reports `verified`, then open a link without specifying the app package, so Android exercises domain resolution:

```sh
adb shell am start -W -a android.intent.action.VIEW -c android.intent.category.BROWSABLE -d 'https://create-audiobook-from-url.patricktree.me/'
```

See [Android's App Links verification guide](https://developer.android.com/training/app-links/verify-applinks) for device settings and troubleshooting.

## Backend access and grant sessions

Mobile API requests use ordinary `fetch` calls patched by `CapacitorHttp` to use native networking. The backend origin is `https://create-audiobook-from-url.patricktree.me`. Browser requests continue using the browser's same-origin fetch.

Both clients exchange trial credentials for persistent Secure, HttpOnly cookies. Capacitor's native cookie manager stores the server-issued cookies and sends them on later requests. The app does not store session tokens in localStorage or add Authorization headers. The `CapacitorCookies` document.cookie patch (<https://capacitorjs.com/docs/apis/cookies>) is not enabled.

Native mutations omit Origin and must include the existing custom request header and JSON content type. Browser mutations must have a matching Origin; cross-site Fetch Metadata is rejected. No cross-origin browser CORS access is enabled.

Capacitor's native HTTP response headers can expose Set-Cookie to JavaScript, so HttpOnly does not provide the same isolation as browser networking.

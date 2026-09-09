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

The debug APK is written to `apps/mobile-app/android/app/build/outputs/apk/debug/app-debug.apk`. The native template has no unit tests; the Gradle test task currently reports `NO-SOURCE`. Android lint and installation provide native build checks. Confirm the landing page renders and the app can close and reopen without a crash.

## iOS

After building, open `apps/mobile-app/ios/App/App.xcodeproj` in Xcode and choose a simulator or configure signing for a device. The project uses Swift Package Manager, matching Content Relay.

## Current scope

This setup bundles the existing web UI. Trial conversion requires the server's same-origin session API, which is not available at Capacitor's local origin. Mobile backend access and trial-link handling are not implemented here. Content Relay's application-specific share overlay is not included because it depends on its send UI; this app has no equivalent mobile share flow yet.

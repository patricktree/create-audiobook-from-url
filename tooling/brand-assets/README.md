# Cup brand assets

Edit `assets/cup.svg` for the native app icons, splash screens, web favicon, and touch/social icon. `assets/cup-dark.svg` is the separate dark-mode web favicon. Keep their artwork coordinated when changing the logo.

`assets/outputs.json` defines raster output paths, sizes, padding through `markSize`, and transparency. Platform assets remain checked in so Xcode and Android Studio can build directly. Treat those generated files as outputs and edit the sources here.

From the repository root:

```sh
pnpm --filter '@cup/web-app' exec cup-brand-assets-cli sync
pnpm --filter '@cup/web-app' exec cup-brand-assets-cli check
```

The web and mobile apps declare `@cup/brand-assets` as a workspace dev dependency and invoke its `cup-brand-assets-cli` binary. Run `cup-brand-assets-cli check` to check without writing. Turbo follows these package dependencies to invalidate consumer builds when the generator or artwork changes.

The web build and native sync regenerate assets automatically. Repository validation runs `cup-brand-assets-cli check` first and fails when checked-in outputs differ from the sources. Regenerate before validating a source change.

The generator also creates Android's `drawable-v24/ic_launcher_foreground.xml`. Its SVG-to-vector conversion supports paths with explicit six-digit hex fills and rejects unsupported SVG features. The raster renderer preserves the complete SVG. Extend vector conversion before introducing shapes or effects that Android cannot currently reproduce.

Generated outputs include both web favicons, the web touch/social PNG, iOS app and splash PNGs, Android launcher/adaptive foreground and splash PNGs, and the Android vector foreground. The platform wrappers and white background resources remain native configuration.

# Mobile App Instructions

- For native builds, device setup, or mobile backend limitations, read `README.md` in this directory.
- For local iOS device builds, pass `DEVELOPMENT_TEAM=<team-id>` to `xcodebuild` using the developer's current signing team. Keep Personal Team IDs out of the tracked Xcode project.
- Xcode's team selector writes `DEVELOPMENT_TEAM` into `ios/App/App.xcodeproj/project.pbxproj`; inspect the diff after configuring signing and remove personal team assignments before handoff.
- Verify installation and launch separately. Device setup is complete when the app launches and its UI renders, confirmed by inspection or the user.

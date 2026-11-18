# Android readiness assessment

## Decision

The current React/Vite application is compatible with a future Capacitor wrapper because it already uses browser APIs for local project storage and file import/export, and its core interaction model is pointer-event based. Capacitor is the preferred next integration path; no native wrapper or plugin was added in this refinement because the current environment does not include an Android build validation step or a produced APK artifact.

## Required next implementation

1. Add `@capacitor/core`, `@capacitor/cli`, and `@capacitor/android` only after confirming dependency policy and Android SDK availability.
2. Add `capacitor.config.ts` with app ID `com.soheil6913.pcbstudiopro` and app name `PCB Studio Pro`.
3. Initialize the Android project and validate portrait/landscape layouts on a real emulator or device.
4. Map Android back navigation to closing the active mobile drawer first, then leaving the workspace only when no drawer is open.
5. Validate JSON import/export using Android's file picker and confirm local storage recovery after process restart.

## Current status

- Web application remains the source of truth.
- Touch-oriented pointer events, canvas `touch-action: none`, and mobile drawer behavior are implemented in the web layer.
- No APK has been built or claimed.
- Native plugins are intentionally not present.

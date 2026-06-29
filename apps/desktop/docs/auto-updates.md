# Desktop Auto-Updates

Yishan checks for desktop updates in packaged production builds once at launch, then every 15 minutes while the app remains open.

The interval is defined by `DEFAULT_UPDATE_CHECK_INTERVAL_MS` in `src/main/updates/autoUpdateService.ts` and can be overridden through `startAutoUpdates({ checkIntervalMs })` for tests or future configuration surfaces.

## Testing in Development

By default, update checks are disabled in development and unpackaged runs.

Set `YISHAN_DESKTOP_ENABLE_UPDATES_IN_DEV=true` to enable the release updater flow in dev. When enabled, the updater uses `forceDevUpdateConfig` so manual and scheduled checks run through the same snackbar-driven flow.

In dev runs, Electron may report an app version that does not match release tags. The dev override also enables `allowDowngrade` so test checks still proceed against normal desktop release versions.

To use this successfully, provide a valid `dev-app-update.yml` for your update provider configuration.

Update checks never auto-download or auto-install releases. When an update is detected, the renderer shows the in-app update snackbar and waits for the user to start the download. The snackbar then reports download progress and asks the user to restart after the download completes.

The native `Check for Updates` menu item uses the same in-app snackbar flow as automatic checks. Native update dialogs are intentionally not used.

If a user closes an automatically surfaced update-available snackbar, the app suppresses additional automatic update-available prompts for the rest of that app session on the same local calendar day. Manual `Check for Updates` remains available and is not suppressed.

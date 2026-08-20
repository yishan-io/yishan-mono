# Desktop Main-Process Architecture

`DesktopApplication` is the Electron composition root. It creates capability owners, wires lifecycle callbacks, and calls `bridge/registerDesktopHostIpc.ts`. It does not register individual IPC handlers or perform host operations itself.

## Host bridge and IPC

`bridge/channels.ts` owns every immutable `desktop:host/*` and `desktop:rpc/event` wire string. Capability contract files in `bridge/` define the preload and renderer-facing TypeScript surface; `desktopBridge.ts` composes them without changing `window.desktop` or `window.__YISHAN__`.

`preload.ts` maps that surface directly to channels. `registerDesktopHostIpc.ts` composes one registrar per capability. Each file in `ipc/register*Ipc.ts` only decodes its input, invokes one supplied operation, and returns its result. Registrars do not create lifecycle owners or access Electron/OS APIs directly.

## Capability owners

- `app/desktopAppInfo.ts`, `auth/accountSwitch.ts`, and `daemon/daemonHost.ts` own renderer-facing app, account-switch, and daemon operations.
- `window/folderPicker.ts`, `files/fileSystemOperations.ts`, `clipboard/clipboardText.ts`, `clipboard/externalFileClipboardReader.ts`, and `external-app/` own their named OS interactions.
- `browser/browserHistory.ts` remains main-owned because it persists account-scoped history and flushes during exit.
- `notifications/notificationHost.ts` owns notification dispatch, sound preview, and microphone permission.
- `updates/updateRuntime.ts` owns update checks, download state, and installation. It awaits the injected `lifecycle/restartPreparation.ts` operation before `quitAndInstall(false, true)`.

## Lifecycle and daemon hierarchy

`lifecycle/appLifecycle.ts` owns Electron lifecycle wiring. `lifecycle/restartPreparation.ts` marks quit intent, flushes history, and conditionally stops the daemon; cleanup failures are logged and tolerated.

`DaemonManager` is the only daemon lifecycle coordinator. `daemonEndpoint.ts` resolves profile, persisted paths, and endpoints; `daemonHealthCheck.ts` owns retry and health interpretation; `daemonCliInvocation.ts` owns CLI discovery and commands; and `daemonDevProcess.ts` owns the development foreground child. No registrar owns daemon lifecycle.

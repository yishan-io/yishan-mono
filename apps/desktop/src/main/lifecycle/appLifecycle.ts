import type { App } from "electron";

export type AppLifecycleOptions = {
  /** Asks the user to confirm quitting; resolves true when quitting proceeds. */
  confirmQuit: () => Promise<boolean>;
  /** Runs teardown (browser history flush, daemon stop) before quit. */
  runBeforeQuitCleanup: () => Promise<void>;
  /** Routes one protocol callback URL (open-url / pending at startup). */
  onProtocolUrl: (callbackUrl: string) => void;
  /** Recreates + focuses the window (activate on macOS). */
  onActivate: () => void;
  /** Returns true when a quit flow is in progress (darwin window-all-closed policy). */
  isQuitting: () => boolean;
  /** Marks the quit flow as in progress. */
  setQuitting: (quitting: boolean) => void;
  /** Returns + clears a pending protocol URL captured before app ready. */
  takePendingProtocolUrl: () => string | null;
};

/**
 * AppLifecycle — one owner for Electron app lifecycle and quit policy.
 *
 * Wires before-quit (confirm → cleanup → quit with cancel path), activate,
 * open-url, window-all-closed, and the pending-startup protocol URL flush.
 */
export function wireAppLifecycle(app: App, options: AppLifecycleOptions): void {
  const { confirmQuit, runBeforeQuitCleanup, onProtocolUrl, onActivate, isQuitting, setQuitting } = options;
  let hasProcessedBeforeQuit = false;

  app.on("before-quit", (event) => {
    setQuitting(true);

    if (hasProcessedBeforeQuit) {
      return;
    }

    event.preventDefault();

    void confirmQuit().then((shouldQuit) => {
      if (!shouldQuit) {
        setQuitting(false);
        return;
      }

      hasProcessedBeforeQuit = true;
      void runBeforeQuitCleanup().finally(() => {
        app.quit();
      });
    });
  });

  app.on("activate", () => {
    onActivate();
  });

  app.on("open-url", (event, callbackUrl) => {
    event.preventDefault();
    onProtocolUrl(callbackUrl);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin" || isQuitting()) {
      app.quit();
    }
  });

  const pendingProtocolUrl = options.takePendingProtocolUrl();
  if (pendingProtocolUrl) {
    onProtocolUrl(pendingProtocolUrl);
  }
}

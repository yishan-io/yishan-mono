import { subscribeDesktopRpcEvent } from "../../events/desktopRpcEventBus";
import { type compileShortcutDefinitions, processShortcuts } from "../../shortcuts/shortcutRunner";
import type { ShortContext } from "../../shortcuts/types";

export type ShortcutRuntimeInput = {
  /** Returns the latest compiled shortcut definitions. */
  getCompiledDefinitions: () => ReturnType<typeof compileShortcutDefinitions>;
  /** Returns the latest shortcut execution context (routes, stores, commands). */
  getContext: () => ShortContext;
  /** When true, shortcut processing is paused (keybinding capture mode). */
  isCaptureActive: () => boolean;
};

/**
 * Application shortcut runtime (Phase 13, desktop5.md).
 *
 * Long-lived resource: owns the window keydown listener and the webview
 * keydown RPC subscription that feed `processShortcuts`. The React hook only
 * supplies the latest compiled definitions and context and mounts this
 * runtime for the lifetime of the app frame.
 */
export function startShortcutRuntime(input: ShortcutRuntimeInput): () => void {
  const handleWindowKeydown = (event: KeyboardEvent) => {
    if (input.isCaptureActive()) {
      return;
    }

    processShortcuts(input.getCompiledDefinitions(), input.getContext(), event);
  };

  window.addEventListener("keydown", handleWindowKeydown, true);

  const unsubscribeWebviewKeydown = subscribeDesktopRpcEvent((desktopEvent) => {
    if (desktopEvent.method !== "webviewKeydown" || input.isCaptureActive()) {
      return;
    }

    const payload = desktopEvent.payload as
      | {
          key?: string;
          code?: string;
          ctrlKey?: boolean;
          metaKey?: boolean;
          shiftKey?: boolean;
          altKey?: boolean;
        }
      | undefined;

    const syntheticEvent = new KeyboardEvent("keydown", {
      key: payload?.key ?? "",
      code: payload?.code ?? "",
      ctrlKey: Boolean(payload?.ctrlKey),
      metaKey: Boolean(payload?.metaKey),
      shiftKey: Boolean(payload?.shiftKey),
      altKey: Boolean(payload?.altKey),
    });

    processShortcuts(input.getCompiledDefinitions(), input.getContext(), syntheticEvent);
  });

  return () => {
    window.removeEventListener("keydown", handleWindowKeydown, true);
    unsubscribeWebviewKeydown();
  };
}

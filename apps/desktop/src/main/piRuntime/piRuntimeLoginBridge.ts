import type { AuthLoginCallbacks, AuthPrompt } from "@earendil-works/pi-ai";
import { BrowserWindow, dialog, shell } from "electron";
import { getErrorMessage } from "../../shared/helpers/errorHelpers";
import type { PiAuthPromptRequest } from "./piRuntimeTypes";

const OPENAI_CODEX_PROVIDER_ID = "openai-codex";
const OPENAI_CODEX_BROWSER_LOGIN_METHOD = "browser";
const BROWSER_CALLBACK_TIMEOUT_MS = 5 * 60_000;

export type PiAuthPromptRequester = (prompt: PiAuthPromptRequest) => Promise<string>;

/** Adapts Pi AI authentication callbacks to browser-only OAuth and renderer-owned credential prompts. */
export function createPiRuntimeAuthCallbacks(
  window: BrowserWindow | null | undefined,
  requestPrompt: PiAuthPromptRequester,
  providerId: string,
  authenticationSignal?: AbortSignal,
): AuthLoginCallbacks {
  return {
    prompt: async (prompt) => {
      if (prompt.type === "manual_code") {
        return await waitForBrowserCallback(prompt.signal, authenticationSignal);
      }
      if (providerId === OPENAI_CODEX_PROVIDER_ID && prompt.type === "select") {
        const browserOption = prompt.options.find((option) => option.id === OPENAI_CODEX_BROWSER_LOGIN_METHOD);
        if (!browserOption) {
          throw new Error("OpenAI browser login is not available.");
        }
        return browserOption.id;
      }
      return await requestPrompt(toPromptRequest(prompt));
    },
    notify: (event) => {
      // fire-and-forget: Pi's notification callback is synchronous while Electron dialogs and external URLs are async.
      void notifyPiAuthEvent(window, event).catch((error) => {
        console.error("Failed to present provider authentication event", getErrorMessage(error));
      });
    },
    signal: authenticationSignal,
  };
}

function waitForBrowserCallback(...signals: Array<AbortSignal | undefined>): Promise<string> {
  return new Promise<string>((_resolve, reject) => {
    let settled = false;
    const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
    const finish = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      for (const signal of activeSignals) {
        signal.removeEventListener("abort", onAbort);
      }
      reject(error);
    };
    const onAbort = (event: Event) => {
      const signal = event.currentTarget;
      finish(signal instanceof AbortSignal ? getBrowserCallbackAbortError(signal) : new Error("Login cancelled."));
    };
    const timeout = setTimeout(
      () => finish(new Error("Browser login timed out. Please retry.")),
      BROWSER_CALLBACK_TIMEOUT_MS,
    );

    const abortedSignal = activeSignals.find((signal) => signal.aborted);
    if (abortedSignal) {
      finish(getBrowserCallbackAbortError(abortedSignal));
      return;
    }
    for (const signal of activeSignals) {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function getBrowserCallbackAbortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error && signal.reason.name !== "AbortError"
    ? signal.reason
    : new Error("Browser callback wait cancelled.");
}

function toPromptRequest(prompt: Exclude<AuthPrompt, { type: "manual_code" }>): PiAuthPromptRequest {
  switch (prompt.type) {
    case "select":
      return { type: "select", message: prompt.message, options: prompt.options };
    case "secret":
    case "text":
      return {
        type: prompt.type,
        message: prompt.message,
        ...(prompt.placeholder ? { placeholder: prompt.placeholder } : {}),
      };
  }
}

/** Shows non-secret authentication instructions in a native Electron dialog. */
async function showPiAuthInstructions(parentWindow: BrowserWindow | null | undefined, message: string): Promise<void> {
  const window = resolveDialogWindow(parentWindow);
  const options = {
    type: "info" as const,
    buttons: ["OK"],
    defaultId: 0,
    title: "Agent connections",
    message,
    noLink: true,
  };

  if (window) {
    window.show();
    window.focus();
    await dialog.showMessageBox(window, options);
    return;
  }
  await dialog.showMessageBox(options);
}

async function notifyPiAuthEvent(
  window: BrowserWindow | null | undefined,
  event: Parameters<AuthLoginCallbacks["notify"]>[0],
): Promise<void> {
  switch (event.type) {
    case "auth_url":
      await shell.openExternal(event.url);
      return;
    case "device_code":
      await shell.openExternal(event.verificationUri);
      await showPiAuthInstructions(
        window,
        buildDeviceCodeInstructions(event.userCode, event.verificationUri, event.expiresInSeconds),
      );
      return;
    case "progress":
      return;
  }
}

function buildDeviceCodeInstructions(userCode: string, verificationUri: string, expiresInSeconds?: number): string {
  return [
    `Open: ${verificationUri}`,
    `Enter code: ${userCode}`,
    expiresInSeconds ? `Expires in ${expiresInSeconds} seconds.` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function resolveDialogWindow(parentWindow: BrowserWindow | null | undefined): BrowserWindow | null {
  if (parentWindow && !parentWindow.isDestroyed()) {
    return parentWindow;
  }
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow && !focusedWindow.isDestroyed()) {
    return focusedWindow;
  }
  return BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) ?? null;
}

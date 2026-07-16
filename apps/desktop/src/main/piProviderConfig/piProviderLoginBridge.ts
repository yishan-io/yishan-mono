import type { AuthLoginCallbacks, AuthPrompt } from "@earendil-works/pi-ai";
import { BrowserWindow, dialog } from "electron";
import type { PiAuthPromptRequest } from "../../shared/contracts/piProviderConfig";
import { getErrorMessage } from "../../shared/helpers/errorHelpers";
import { openExternalUrl } from "../integrations/externalAppLauncher";

/** Requests one credential or login choice from the initiating renderer. */
export type PiAuthPromptRequester = (prompt: PiAuthPromptRequest, signal?: AbortSignal) => Promise<string>;

/** Adapts Pi AI authentication callbacks to browser-only OAuth and renderer-owned credential prompts. */
export function createPiProviderAuthCallbacks(
  window: BrowserWindow | null | undefined,
  requestPrompt: PiAuthPromptRequester,
  authenticationSignal?: AbortSignal,
): AuthLoginCallbacks {
  return {
    prompt: async (prompt) => {
      const signal = combineAbortSignals(prompt.signal, authenticationSignal);
      const request = toPromptRequest(prompt);
      return signal ? await requestPrompt(request, signal) : await requestPrompt(request);
    },
    notify: (event) => {
      // fire-and-forget: Pi's notification callback is synchronous while Electron dialogs and external URLs are async.
      void notifyPiAuthEvent(window, event, authenticationSignal).catch((error) => {
        if (authenticationSignal?.aborted) {
          return;
        }
        console.error("Failed to present provider authentication event", getErrorMessage(error));
      });
    },
    signal: authenticationSignal,
  };
}

function combineAbortSignals(...signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const activeSignals = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (activeSignals.length < 2) {
    return activeSignals[0];
  }
  return AbortSignal.any(activeSignals);
}

function toPromptRequest(prompt: AuthPrompt): PiAuthPromptRequest {
  switch (prompt.type) {
    case "select":
      return {
        type: "select",
        message: prompt.message,
        options: prompt.options.map(({ id, label }) => ({ id, label })),
      };
    case "secret":
    case "text":
    case "manual_code":
      return {
        type: prompt.type === "manual_code" ? "text" : prompt.type,
        message: prompt.message,
        ...(prompt.placeholder ? { placeholder: prompt.placeholder } : {}),
      };
  }
}

/** Shows non-secret authentication instructions in a native Electron dialog. */
async function showPiAuthInstructions(
  parentWindow: BrowserWindow | null | undefined,
  message: string,
  signal?: AbortSignal,
): Promise<void> {
  const window = resolveDialogWindow(parentWindow);
  const options = {
    type: "info" as const,
    buttons: ["OK"],
    defaultId: 0,
    title: "Agent connections",
    message,
    noLink: true,
    ...(signal ? { signal } : {}),
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
  authenticationSignal?: AbortSignal,
): Promise<void> {
  switch (event.type) {
    case "auth_url":
      if (!(await openPiAuthenticationUrl(event.url))) {
        await showPiAuthInstructions(window, buildBrowserLoginInstructions(event.url), authenticationSignal);
      }
      return;
    case "device_code":
      await openPiAuthenticationUrl(event.verificationUri);
      await showPiAuthInstructions(
        window,
        buildDeviceCodeInstructions(event.userCode, event.verificationUri, event.expiresInSeconds),
        authenticationSignal,
      );
      return;
    case "progress":
      return;
  }
}

async function openPiAuthenticationUrl(url: string): Promise<boolean> {
  const result = await openExternalUrl(url);
  return result.opened;
}

function buildBrowserLoginInstructions(url: string): string {
  return ["Could not open your browser automatically.", `Open: ${url}`].join("\n");
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

import { BrowserWindow, ipcMain } from "electron";
import { HOST_IPC_CHANNELS } from "../ipc";
import { PiRuntimeAuthenticationCoordinator } from "../piRuntime/piRuntimeAuthenticationCoordinator";
import {
  PiRuntimeError,
  normalizePiRuntimeAuthenticationError,
  toPiRuntimeErrorPayload,
} from "../piRuntime/piRuntimeErrors";
import { createPiRuntimeAuthCallbacks } from "../piRuntime/piRuntimeLoginBridge";
import { PiRuntimePromptCoordinator } from "../piRuntime/piRuntimePromptCoordinator";
import type { PiRuntimeService } from "../piRuntime/piRuntimeService";
import type {
  AuthenticatePiProviderInput,
  PiAuthPromptResponseInput,
  PiRuntimeSnapshot,
  PiRuntimeSnapshotResult,
} from "../piRuntime/piRuntimeTypes";

/** Registers host IPC handlers for Pi provider/model runtime inspection and login. */
export function registerPiRuntimeIpcHandlers(
  piRuntimeService: PiRuntimeService,
  resolveMainWindow: () => BrowserWindow | null,
): void {
  const promptCoordinator = new PiRuntimePromptCoordinator();
  const authenticationCoordinator = new PiRuntimeAuthenticationCoordinator();

  ipcMain.handle(HOST_IPC_CHANNELS.getPiRuntimeSnapshot, async () => {
    return piRuntimeService.getSnapshot();
  });

  ipcMain.handle(HOST_IPC_CHANNELS.refreshPiRuntime, async () => {
    return piRuntimeService.refreshSnapshot();
  });

  ipcMain.handle(HOST_IPC_CHANNELS.authenticatePiProvider, async (event, input: AuthenticatePiProviderInput) => {
    return await runPiRuntimeSnapshotOperation("Provider authentication failed", async () => {
      const window = BrowserWindow.fromWebContents(event.sender) ?? resolveMainWindow();
      if (!window) {
        throw new PiRuntimeError("operation_failed", "Main window is not available for provider login.");
      }
      const senderId = event.sender.id;
      const signal = authenticationCoordinator.begin(event.sender, input.providerId);
      try {
        try {
          return await piRuntimeService.authenticate(
            input.providerId,
            input.method,
            createPiRuntimeAuthCallbacks(
              window,
              (prompt) => promptCoordinator.request(window.webContents, prompt),
              signal,
            ),
          );
        } catch (error) {
          throw normalizePiRuntimeAuthenticationError(error, signal);
        }
      } finally {
        authenticationCoordinator.finish(senderId, input.providerId);
      }
    });
  });

  ipcMain.handle(HOST_IPC_CHANNELS.cancelPiProviderAuthentication, async (event, providerId: string) => {
    return { ok: authenticationCoordinator.cancel(event.sender.id, providerId) };
  });

  ipcMain.handle(HOST_IPC_CHANNELS.respondPiAuthPrompt, async (event, input: PiAuthPromptResponseInput) => {
    return { ok: promptCoordinator.respond(event.sender.id, input) };
  });

  ipcMain.handle(HOST_IPC_CHANNELS.removePiProviderCredential, async (_event, providerId: string) => {
    return await runPiRuntimeSnapshotOperation("Removing provider credential failed", async () => {
      return await piRuntimeService.removeCredential(providerId);
    });
  });
}

async function runPiRuntimeSnapshotOperation(
  logMessage: string,
  operation: () => Promise<PiRuntimeSnapshot>,
): Promise<PiRuntimeSnapshotResult> {
  try {
    return { ok: true, snapshot: await operation() };
  } catch (error) {
    console.error(logMessage, error);
    return { ok: false, error: toPiRuntimeErrorPayload(error) };
  }
}

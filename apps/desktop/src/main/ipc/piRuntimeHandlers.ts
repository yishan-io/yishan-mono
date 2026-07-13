import { BrowserWindow, ipcMain } from "electron";
import { HOST_IPC_CHANNELS } from "../ipc";
import { PiRuntimeAuthenticationCoordinator } from "../piRuntime/piRuntimeAuthenticationCoordinator";
import { createPiRuntimeAuthCallbacks } from "../piRuntime/piRuntimeLoginBridge";
import { PiRuntimePromptCoordinator } from "../piRuntime/piRuntimePromptCoordinator";
import type { PiRuntimeService } from "../piRuntime/piRuntimeService";
import type { AuthenticatePiProviderInput, PiAuthPromptResponseInput } from "../piRuntime/piRuntimeTypes";

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
    const window = BrowserWindow.fromWebContents(event.sender) ?? resolveMainWindow();
    if (!window) {
      throw new Error("Main window is not available for provider login.");
    }
    const senderId = event.sender.id;
    const signal = authenticationCoordinator.begin(senderId, input.providerId);
    try {
      return await piRuntimeService.authenticate(
        input.providerId,
        input.method,
        createPiRuntimeAuthCallbacks(
          window,
          (prompt) => promptCoordinator.request(window.webContents, prompt),
          input.providerId,
          signal,
        ),
      );
    } finally {
      authenticationCoordinator.finish(senderId, input.providerId);
    }
  });

  ipcMain.handle(HOST_IPC_CHANNELS.cancelPiProviderAuthentication, async (event, providerId: string) => {
    return { ok: authenticationCoordinator.cancel(event.sender.id, providerId) };
  });

  ipcMain.handle(HOST_IPC_CHANNELS.respondPiAuthPrompt, async (event, input: PiAuthPromptResponseInput) => {
    return { ok: promptCoordinator.respond(event.sender.id, input) };
  });

  ipcMain.handle(HOST_IPC_CHANNELS.removePiProviderCredential, async (_event, providerId: string) => {
    return await piRuntimeService.removeCredential(providerId);
  });
}

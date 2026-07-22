import { BrowserWindow, ipcMain } from "electron";
import type { PiProviderConfigResult } from "../../shared/contracts/piProviderConfig";
import {
  parseAuthenticatePiProviderInput,
  parsePiAuthPromptResponseInput,
  parsePiProviderId,
} from "../../shared/contracts/piProviderConfig";
import { HOST_IPC_CHANNELS } from "../ipc";
import { PiProviderAuthenticationCoordinator } from "../piProviderConfig/piProviderAuthenticationCoordinator";
import {
  PiProviderConfigError,
  normalizePiProviderAuthenticationError,
  toPiProviderConfigErrorPayload,
} from "../piProviderConfig/piProviderConfigErrors";
import type { PiProviderConfigService } from "../piProviderConfig/piProviderConfigService";
import { createPiProviderAuthCallbacks } from "../piProviderConfig/piProviderLoginBridge";
import { PiProviderPromptCoordinator } from "../piProviderConfig/piProviderPromptCoordinator";

/** Registers host IPC handlers for Pi provider/model runtime inspection and login. */
export function registerPiProviderConfigIpcHandlers(
  piProviderConfigService: PiProviderConfigService,
  resolveMainWindow: () => BrowserWindow | null,
): void {
  const promptCoordinator = new PiProviderPromptCoordinator();
  const authenticationCoordinator = new PiProviderAuthenticationCoordinator();

  ipcMain.handle(HOST_IPC_CHANNELS.getPiProviderConfigSnapshot, async () => {
    return await runPiProviderConfigOperation("Loading provider configuration failed", async () => {
      return await piProviderConfigService.getSnapshot();
    });
  });

  ipcMain.handle(HOST_IPC_CHANNELS.refreshPiProviderConfigSnapshot, async () => {
    return await runPiProviderConfigOperation("Refreshing provider configuration failed", async () => {
      return await piProviderConfigService.refreshSnapshot();
    });
  });

  ipcMain.handle(HOST_IPC_CHANNELS.authenticatePiProvider, async (event, rawInput: unknown) => {
    return await runPiProviderConfigOperation("Provider authentication failed", async () => {
      const input = parseAuthenticatePiProviderInput(rawInput);
      if (!input) {
        throw createInvalidInputError();
      }
      const window = BrowserWindow.fromWebContents(event.sender) ?? resolveMainWindow();
      if (!window) {
        throw new PiProviderConfigError("operation_failed", "Main window is not available for provider login.");
      }
      const senderId = event.sender.id;
      const signal = authenticationCoordinator.begin(event.sender, input.providerId);
      try {
        await piProviderConfigService.authenticate(
          input.providerId,
          input.method,
          createPiProviderAuthCallbacks(
            window,
            (prompt, promptSignal) => promptCoordinator.request(window.webContents, prompt, promptSignal),
            signal,
          ),
        );
      } catch (error) {
        throw normalizePiProviderAuthenticationError(error, signal);
      } finally {
        authenticationCoordinator.finish(senderId, input.providerId);
      }
      return true as const;
    });
  });

  ipcMain.handle(HOST_IPC_CHANNELS.cancelPiProviderAuthentication, async (event, rawProviderId: unknown) => {
    return await runPiProviderConfigOperation("Cancelling provider authentication failed", async () => {
      const providerId = parsePiProviderId(rawProviderId);
      if (!providerId) {
        throw createInvalidInputError();
      }
      if (!authenticationCoordinator.cancel(event.sender.id, providerId)) {
        return false as const;
      }
      return true as const;
    });
  });

  ipcMain.handle(HOST_IPC_CHANNELS.respondPiAuthPrompt, async (event, rawInput: unknown) => {
    return await runPiProviderConfigOperation("Responding to provider authentication prompt failed", async () => {
      const input = parsePiAuthPromptResponseInput(rawInput);
      if (!input) {
        throw createInvalidInputError();
      }
      if (!promptCoordinator.respond(event.sender.id, input)) {
        throw new PiProviderConfigError("operation_failed", "Authentication prompt is no longer active.");
      }
      return true as const;
    });
  });

  ipcMain.handle(HOST_IPC_CHANNELS.removePiProviderCredential, async (_event, rawProviderId: unknown) => {
    return await runPiProviderConfigOperation("Removing provider credential failed", async () => {
      const providerId = parsePiProviderId(rawProviderId);
      if (!providerId) {
        throw createInvalidInputError();
      }
      await piProviderConfigService.removeCredential(providerId);
      return true as const;
    });
  });
}

async function runPiProviderConfigOperation<T>(
  logMessage: string,
  operation: () => Promise<T>,
): Promise<PiProviderConfigResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    const errorPayload = toPiProviderConfigErrorPayload(error);
    console.error(logMessage, errorPayload.code, errorPayload.message);
    return { ok: false, error: errorPayload };
  }
}

function createInvalidInputError(): PiProviderConfigError {
  return new PiProviderConfigError("invalid_input", "The provider operation input is invalid.");
}

import { BrowserWindow, ipcMain } from "electron";
import type { PiRuntimeMutationOutcome, PiRuntimeResult } from "../../shared/contracts/piRuntime";
import {
  parseAuthenticatePiProviderInput,
  parsePiAuthPromptResponseInput,
  parsePiProviderId,
} from "../../shared/contracts/piRuntime";
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

/** Registers host IPC handlers for Pi provider/model runtime inspection and login. */
export function registerPiRuntimeIpcHandlers(
  piRuntimeService: PiRuntimeService,
  resolveMainWindow: () => BrowserWindow | null,
): void {
  const promptCoordinator = new PiRuntimePromptCoordinator();
  const authenticationCoordinator = new PiRuntimeAuthenticationCoordinator();

  ipcMain.handle(HOST_IPC_CHANNELS.getPiRuntimeSnapshot, async () => {
    return await runPiRuntimeOperation("Loading provider runtime failed", async () => {
      return await piRuntimeService.getSnapshot();
    });
  });

  ipcMain.handle(HOST_IPC_CHANNELS.authenticatePiProvider, async (event, rawInput: unknown) => {
    return await runPiRuntimeOperation("Provider authentication failed", async () => {
      const input = parseAuthenticatePiProviderInput(rawInput);
      if (!input) {
        throw createInvalidInputError();
      }
      const window = BrowserWindow.fromWebContents(event.sender) ?? resolveMainWindow();
      if (!window) {
        throw new PiRuntimeError("operation_failed", "Main window is not available for provider login.");
      }
      const senderId = event.sender.id;
      const signal = authenticationCoordinator.begin(event.sender, input.providerId);
      try {
        await piRuntimeService.authenticate(
          input.providerId,
          input.method,
          createPiRuntimeAuthCallbacks(
            window,
            (prompt, promptSignal) => promptCoordinator.request(window.webContents, prompt, promptSignal),
            signal,
          ),
        );
      } catch (error) {
        throw normalizePiRuntimeAuthenticationError(error, signal);
      } finally {
        authenticationCoordinator.finish(senderId, input.providerId);
      }
      return await refreshAfterCredentialMutation(piRuntimeService);
    });
  });

  ipcMain.handle(HOST_IPC_CHANNELS.cancelPiProviderAuthentication, async (event, rawProviderId: unknown) => {
    return await runPiRuntimeOperation("Cancelling provider authentication failed", async () => {
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
    return await runPiRuntimeOperation("Responding to provider authentication prompt failed", async () => {
      const input = parsePiAuthPromptResponseInput(rawInput);
      if (!input) {
        throw createInvalidInputError();
      }
      if (!promptCoordinator.respond(event.sender.id, input)) {
        throw new PiRuntimeError("operation_failed", "Authentication prompt is no longer active.");
      }
      return true as const;
    });
  });

  ipcMain.handle(HOST_IPC_CHANNELS.removePiProviderCredential, async (_event, rawProviderId: unknown) => {
    return await runPiRuntimeOperation("Removing provider credential failed", async () => {
      const providerId = parsePiProviderId(rawProviderId);
      if (!providerId) {
        throw createInvalidInputError();
      }
      await piRuntimeService.removeCredential(providerId);
      return await refreshAfterCredentialMutation(piRuntimeService);
    });
  });
}

async function refreshAfterCredentialMutation(service: PiRuntimeService): Promise<PiRuntimeMutationOutcome> {
  try {
    return { snapshot: await service.getSnapshot() };
  } catch (error) {
    const errorPayload = toPiRuntimeErrorPayload(error);
    console.error(
      "Refreshing provider runtime after credential change failed",
      errorPayload.code,
      errorPayload.message,
    );
    return {
      refreshError: {
        code: "snapshot_refresh_failed",
        message: "Credential updated, but provider and model status could not be refreshed. Refresh to try again.",
      },
    };
  }
}

async function runPiRuntimeOperation<T>(logMessage: string, operation: () => Promise<T>): Promise<PiRuntimeResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    const errorPayload = toPiRuntimeErrorPayload(error);
    console.error(logMessage, errorPayload.code, errorPayload.message);
    return { ok: false, error: errorPayload };
  }
}

function createInvalidInputError(): PiRuntimeError {
  return new PiRuntimeError("invalid_input", "The provider operation input is invalid.");
}

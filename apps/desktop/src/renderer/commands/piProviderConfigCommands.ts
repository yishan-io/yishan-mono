import type {
  AuthenticatePiProviderInput,
  PiAuthPromptResponseInput,
  PiProviderConfigMutationResult,
  PiProviderConfigSnapshot,
  PiProviderConfigSnapshotResult,
} from "../../shared/contracts/piProviderConfig";
import { type AiChatModelSelection, isAiChatModelSelectionAvailable } from "../helpers/aiChatSettings";
import { getErrorMessage } from "../helpers/errorHelpers";
import { getDesktopHostBridge } from "../rpc/rpcTransport";
import { aiChatSettingsStore } from "../store/settings/aiChatSettingsStore";
import { piProviderConfigStore } from "../store/settings/piProviderConfigStore";

let nextSnapshotRequestId = 0;
let nextCredentialRequestId = 0;

/** Recoverable result returned when the renderer responds to an authentication prompt. */
export type PiAuthPromptCommandResult = { ok: true } | { ok: false; errorMessage: string };

/** Loads the current Pi provider/model configuration snapshot into the renderer store. */
export async function getPiProviderConfigSnapshot(): Promise<PiProviderConfigSnapshot | null> {
  return await loadPiProviderConfigSnapshot("loading", async () => {
    return await getDesktopHostBridge().getPiProviderConfigSnapshot();
  });
}

/** Reloads Pi provider/model configuration from local runtime state into the renderer store. */
export async function refreshPiProviderConfigSnapshot(): Promise<PiProviderConfigSnapshot | null> {
  return await loadPiProviderConfigSnapshot("refreshing", async () => {
    return await getDesktopHostBridge().refreshPiProviderConfigSnapshot();
  });
}

async function loadPiProviderConfigSnapshot(
  loadState: "loading" | "refreshing",
  loadSnapshot: () => Promise<PiProviderConfigSnapshotResult>,
): Promise<PiProviderConfigSnapshot | null> {
  const requestId = ++nextSnapshotRequestId;
  piProviderConfigStore.getState().beginLoad(requestId, loadState);
  try {
    const result = await loadSnapshot();
    if (!result.ok) {
      piProviderConfigStore.getState().failLoad(requestId, result.error.message);
      return null;
    }
    if (piProviderConfigStore.getState().completeLoad(requestId, result.value)) {
      clearUnavailableDefaultAiChatModel(result.value);
    }
    return result.value;
  } catch (error) {
    piProviderConfigStore.getState().failLoad(requestId, getErrorMessage(error));
    return null;
  }
}

/** Starts one desktop-bridged Pi provider authentication flow. */
export async function authenticatePiProvider(
  input: AuthenticatePiProviderInput,
): Promise<PiProviderConfigSnapshot | null> {
  const requestId = ++nextCredentialRequestId;
  if (!piProviderConfigStore.getState().beginCredentialOperation(requestId, { kind: "authenticate", ...input })) {
    return null;
  }
  try {
    const result = await getDesktopHostBridge().authenticatePiProvider(input);
    return applyPiProviderConfigMutationResult(requestId, result, true);
  } catch (error) {
    piProviderConfigStore.getState().setCredentialOperationError(requestId, getErrorMessage(error));
    return null;
  } finally {
    piProviderConfigStore.getState().finishCredentialOperation(requestId);
  }
}

/** Responds to the active Pi authentication prompt through the renderer command boundary. */
export async function respondPiAuthPrompt(input: PiAuthPromptResponseInput): Promise<PiAuthPromptCommandResult> {
  try {
    const result = await getDesktopHostBridge().respondPiAuthPrompt(input);
    return result.ok ? { ok: true } : { ok: false, errorMessage: result.error.message };
  } catch (error) {
    return { ok: false, errorMessage: getErrorMessage(error) };
  }
}

/** Cancels the matching browser OAuth flow without clearing pending state before main confirms settlement. */
export async function cancelPiProviderAuthentication(providerId: string): Promise<boolean> {
  try {
    const result = await getDesktopHostBridge().cancelPiProviderAuthentication(providerId);
    if (!result.ok) {
      piProviderConfigStore.getState().setErrorMessage(result.error.message);
      return false;
    }
    return result.value;
  } catch (error) {
    piProviderConfigStore.getState().setErrorMessage(getErrorMessage(error));
    return false;
  }
}

/** Removes one stored Pi credential and refreshes source/availability state. */
export async function removePiProviderCredential(providerId: string): Promise<PiProviderConfigSnapshot | null> {
  const requestId = ++nextCredentialRequestId;
  if (!piProviderConfigStore.getState().beginCredentialOperation(requestId, { kind: "remove", providerId })) {
    return null;
  }
  try {
    const result = await getDesktopHostBridge().removePiProviderCredential(providerId);
    return applyPiProviderConfigMutationResult(requestId, result, false);
  } catch (error) {
    piProviderConfigStore.getState().setCredentialOperationError(requestId, getErrorMessage(error));
    return null;
  } finally {
    piProviderConfigStore.getState().finishCredentialOperation(requestId);
  }
}

function applyPiProviderConfigMutationResult(
  requestId: number,
  result: PiProviderConfigMutationResult,
  suppressCancellation: boolean,
): PiProviderConfigSnapshot | null {
  if (!result.ok) {
    if (!suppressCancellation || result.error.code !== "cancelled") {
      piProviderConfigStore.getState().setCredentialOperationError(requestId, result.error.message);
    }
    return null;
  }
  if ("refreshError" in result.value) {
    piProviderConfigStore.getState().setCredentialOperationError(requestId, result.value.refreshError.message);
    return null;
  }
  applyPiProviderConfigSnapshot(result.value.snapshot);
  return result.value.snapshot;
}

function applyPiProviderConfigSnapshot(snapshot: PiProviderConfigSnapshot): void {
  piProviderConfigStore.getState().setSnapshot(snapshot);
  clearUnavailableDefaultAiChatModel(snapshot);
}

function clearUnavailableDefaultAiChatModel(snapshot: PiProviderConfigSnapshot): void {
  const defaultModel = aiChatSettingsStore.getState().defaultModel;
  if (defaultModel && !snapshot.modelsLoadError && !isAiChatModelSelectionAvailable(snapshot.models, defaultModel)) {
    aiChatSettingsStore.getState().setDefaultModel(undefined);
  }
}

/** Persists the provider/model used when Desktop AI Chat starts a new session. */
export function setDefaultAiChatModel(selection: AiChatModelSelection | undefined): void {
  aiChatSettingsStore.getState().setDefaultModel(selection);
}

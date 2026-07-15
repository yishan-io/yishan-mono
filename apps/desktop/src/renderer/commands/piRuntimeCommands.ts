import type {
  AuthenticatePiProviderInput,
  PiAuthPromptResponseInput,
  PiRuntimeMutationResult,
  PiRuntimeSnapshot,
} from "../../shared/contracts/piRuntime";
import { type AiChatModelSelection, isAiChatModelSelectionAvailable } from "../helpers/aiChatSettings";
import { getErrorMessage } from "../helpers/errorHelpers";
import { getDesktopHostBridge } from "../rpc/rpcTransport";
import { aiChatSettingsStore } from "../store/settings/aiChatSettingsStore";
import { piRuntimeStore } from "../store/settings/piRuntimeStore";

let nextSnapshotRequestId = 0;
let nextCredentialRequestId = 0;

/** Recoverable result returned when the renderer responds to an authentication prompt. */
export type PiAuthPromptCommandResult = { ok: true } | { ok: false; errorMessage: string };

/** Loads the current Pi provider/model runtime snapshot into the renderer store. */
export async function getPiRuntimeSnapshot(
  loadState: "loading" | "refreshing" = "loading",
): Promise<PiRuntimeSnapshot | null> {
  const requestId = ++nextSnapshotRequestId;
  piRuntimeStore.getState().beginLoad(requestId, loadState);
  try {
    const result = await getDesktopHostBridge().getPiRuntimeSnapshot();
    if (!result.ok) {
      piRuntimeStore.getState().failLoad(requestId, result.error.message);
      return null;
    }
    if (piRuntimeStore.getState().completeLoad(requestId, result.value)) {
      clearUnavailableDefaultPiModel(result.value);
    }
    return result.value;
  } catch (error) {
    piRuntimeStore.getState().failLoad(requestId, getErrorMessage(error));
    return null;
  }
}

/** Starts one desktop-bridged Pi provider authentication flow. */
export async function authenticatePiProvider(input: AuthenticatePiProviderInput): Promise<PiRuntimeSnapshot | null> {
  const requestId = ++nextCredentialRequestId;
  if (!piRuntimeStore.getState().beginCredentialOperation(requestId, { kind: "authenticate", ...input })) {
    return null;
  }
  try {
    const result = await getDesktopHostBridge().authenticatePiProvider(input);
    return applyPiRuntimeMutationResult(requestId, result, true);
  } catch (error) {
    piRuntimeStore.getState().setCredentialOperationError(requestId, getErrorMessage(error));
    return null;
  } finally {
    piRuntimeStore.getState().finishCredentialOperation(requestId);
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
      piRuntimeStore.getState().setErrorMessage(result.error.message);
      return false;
    }
    return result.value;
  } catch (error) {
    piRuntimeStore.getState().setErrorMessage(getErrorMessage(error));
    return false;
  }
}

/** Removes one stored Pi credential and refreshes source/availability state. */
export async function removePiProviderCredential(providerId: string): Promise<PiRuntimeSnapshot | null> {
  const requestId = ++nextCredentialRequestId;
  if (!piRuntimeStore.getState().beginCredentialOperation(requestId, { kind: "remove", providerId })) {
    return null;
  }
  try {
    const result = await getDesktopHostBridge().removePiProviderCredential(providerId);
    return applyPiRuntimeMutationResult(requestId, result, false);
  } catch (error) {
    piRuntimeStore.getState().setCredentialOperationError(requestId, getErrorMessage(error));
    return null;
  } finally {
    piRuntimeStore.getState().finishCredentialOperation(requestId);
  }
}

function applyPiRuntimeMutationResult(
  requestId: number,
  result: PiRuntimeMutationResult,
  suppressCancellation: boolean,
): PiRuntimeSnapshot | null {
  if (!result.ok) {
    if (!suppressCancellation || result.error.code !== "cancelled") {
      piRuntimeStore.getState().setCredentialOperationError(requestId, result.error.message);
    }
    return null;
  }
  if (result.value.refreshError) {
    piRuntimeStore.getState().setCredentialOperationError(requestId, result.value.refreshError.message);
  }
  if (!result.value.snapshot) {
    return null;
  }
  applyPiRuntimeSnapshot(result.value.snapshot);
  return result.value.snapshot;
}

function applyPiRuntimeSnapshot(snapshot: PiRuntimeSnapshot): void {
  piRuntimeStore.getState().setSnapshot(snapshot);
  clearUnavailableDefaultPiModel(snapshot);
}

function clearUnavailableDefaultPiModel(snapshot: PiRuntimeSnapshot): void {
  const defaultModel = aiChatSettingsStore.getState().defaultModel;
  if (defaultModel && !snapshot.modelsLoadError && !isAiChatModelSelectionAvailable(snapshot.models, defaultModel)) {
    aiChatSettingsStore.getState().setDefaultModel(undefined);
  }
}

/** Persists the provider/model used when Desktop AI Chat starts a new session. */
export function setDefaultAiChatModel(selection: AiChatModelSelection | undefined): void {
  aiChatSettingsStore.getState().setDefaultModel(selection);
}

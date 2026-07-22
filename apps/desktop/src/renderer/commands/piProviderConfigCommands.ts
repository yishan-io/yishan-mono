import type {
  AuthenticatePiProviderInput,
  PiAuthPromptResponseInput,
  PiProviderConfigResult,
  PiProviderConfigSnapshotResult,
} from "../../shared/contracts/piProviderConfig";
import type { AiChatModelSelection } from "../helpers/aiChatSettings";
import { getErrorMessage } from "../helpers/errorHelpers";
import { getDesktopHostBridge } from "../rpc/rpcTransport";
import { aiChatSettingsStore } from "../store/settings/aiChatSettingsStore";
import { piProviderConfigStore } from "../store/settings/piProviderConfigStore";

let nextSnapshotRequestId = 0;

/** Recoverable result returned when the renderer responds to an authentication prompt. */
export type PiAuthPromptCommandResult = { ok: true } | { ok: false; errorMessage: string };

/** Loads the current Pi provider/model configuration snapshot into the renderer store. */
export async function getPiProviderConfigSnapshot(): Promise<void> {
  await loadPiProviderConfigSnapshot("loading", async () => {
    return await getDesktopHostBridge().getPiProviderConfigSnapshot();
  });
}

/** Reloads Pi provider/model configuration from local runtime state into the renderer store. */
export async function refreshPiProviderConfigSnapshot(): Promise<void> {
  await loadPiProviderConfigSnapshot("refreshing", async () => {
    return await getDesktopHostBridge().refreshPiProviderConfigSnapshot();
  });
}

async function loadPiProviderConfigSnapshot(
  loadState: "loading" | "refreshing",
  loadSnapshot: () => Promise<PiProviderConfigSnapshotResult>,
): Promise<void> {
  const requestId = ++nextSnapshotRequestId;
  piProviderConfigStore.getState().beginLoad(requestId, loadState);
  try {
    const result = await loadSnapshot();
    if (!result.ok) {
      piProviderConfigStore.getState().failLoad(requestId, result.error.message);
      return;
    }
    piProviderConfigStore.getState().completeLoad(requestId, result.value);
  } catch (error) {
    piProviderConfigStore.getState().failLoad(requestId, getErrorMessage(error));
  }
}

/** Starts one desktop-bridged Pi provider authentication flow. */
export async function authenticatePiProvider(input: AuthenticatePiProviderInput): Promise<void> {
  if (!piProviderConfigStore.getState().beginCredentialOperation({ kind: "authenticate", ...input })) {
    return;
  }
  try {
    const result = await getDesktopHostBridge().authenticatePiProvider(input);
    await refreshAfterPiProviderConfigMutation(result, true);
  } catch (error) {
    piProviderConfigStore.getState().setErrorMessage(getErrorMessage(error));
  } finally {
    piProviderConfigStore.getState().finishCredentialOperation();
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
export async function removePiProviderCredential(providerId: string): Promise<void> {
  if (!piProviderConfigStore.getState().beginCredentialOperation({ kind: "remove", providerId })) {
    return;
  }
  try {
    const result = await getDesktopHostBridge().removePiProviderCredential(providerId);
    await refreshAfterPiProviderConfigMutation(result, false);
  } catch (error) {
    piProviderConfigStore.getState().setErrorMessage(getErrorMessage(error));
  } finally {
    piProviderConfigStore.getState().finishCredentialOperation();
  }
}

async function refreshAfterPiProviderConfigMutation(
  result: PiProviderConfigResult<true>,
  suppressCancellation: boolean,
): Promise<void> {
  if (!result.ok) {
    if (!suppressCancellation || result.error.code !== "cancelled") {
      piProviderConfigStore.getState().setErrorMessage(result.error.message);
    }
    return;
  }
  await refreshPiProviderConfigSnapshot();
}

/** Persists the provider/model used when Desktop AI Chat starts a new session. */
export function setDefaultAiChatModel(selection: AiChatModelSelection | undefined): void {
  aiChatSettingsStore.getState().setDefaultModel(selection);
}

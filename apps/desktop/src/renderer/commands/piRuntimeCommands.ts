import type {
  AuthenticatePiProviderInput,
  PiAuthPromptResponseInput,
  PiRuntimeSnapshot,
  PiRuntimeSnapshotResult,
} from "../../main/piRuntime/piRuntimeTypes";
import { getErrorMessage } from "../helpers/errorHelpers";
import { getDesktopHostBridge } from "../rpc/rpcTransport";
import { agentSettingsStore } from "../store/settings/agentSettingsStore";
import { piRuntimeStore } from "../store/settings/piRuntimeStore";

const INACTIVE_AUTH_PROMPT_MESSAGE = "Authentication prompt is no longer active. Please retry.";

/** Recoverable result returned when the renderer responds to an authentication prompt. */
export type PiAuthPromptCommandResult = { ok: true } | { ok: false; errorMessage: string };

/** Loads the current Pi provider/model runtime snapshot into the renderer store. */
export async function getPiRuntimeSnapshot(): Promise<PiRuntimeSnapshot | null> {
  piRuntimeStore.getState().setLoadState("loading");
  piRuntimeStore.getState().setErrorMessage(undefined);
  try {
    const snapshot = await getDesktopHostBridge().getPiRuntimeSnapshot();
    piRuntimeStore.getState().setSnapshot(snapshot);
    return snapshot;
  } catch (error) {
    piRuntimeStore.getState().setErrorMessage(getErrorMessage(error));
    return null;
  } finally {
    piRuntimeStore.getState().setLoadState("idle");
  }
}

/** Refreshes the Pi provider/model runtime snapshot from disk-backed Pi config. */
export async function refreshPiRuntime(): Promise<PiRuntimeSnapshot | null> {
  piRuntimeStore.getState().setLoadState("refreshing");
  piRuntimeStore.getState().setErrorMessage(undefined);
  try {
    const snapshot = await getDesktopHostBridge().refreshPiRuntime();
    piRuntimeStore.getState().setSnapshot(snapshot);
    return snapshot;
  } catch (error) {
    piRuntimeStore.getState().setErrorMessage(getErrorMessage(error));
    return null;
  } finally {
    piRuntimeStore.getState().setLoadState("idle");
  }
}

/** Starts one desktop-bridged Pi provider authentication flow. */
export async function authenticatePiProvider(input: AuthenticatePiProviderInput): Promise<PiRuntimeSnapshot | null> {
  piRuntimeStore.getState().setPendingCredentialAction({ kind: "authenticate", ...input });
  piRuntimeStore.getState().setErrorMessage(undefined);
  try {
    const result = await getDesktopHostBridge().authenticatePiProvider(input);
    return applyPiRuntimeSnapshotResult(result, true);
  } catch (error) {
    piRuntimeStore.getState().setErrorMessage(getErrorMessage(error));
    return null;
  } finally {
    piRuntimeStore.getState().setPendingCredentialAction(undefined);
  }
}

/** Responds to the active Pi authentication prompt through the renderer command boundary. */
export async function respondPiAuthPrompt(input: PiAuthPromptResponseInput): Promise<PiAuthPromptCommandResult> {
  try {
    const result = await getDesktopHostBridge().respondPiAuthPrompt(input);
    return result.ok ? { ok: true } : { ok: false, errorMessage: INACTIVE_AUTH_PROMPT_MESSAGE };
  } catch (error) {
    return { ok: false, errorMessage: getErrorMessage(error) };
  }
}

/** Cancels the matching browser OAuth flow without clearing pending state before main confirms settlement. */
export async function cancelPiProviderAuthentication(providerId: string): Promise<boolean> {
  try {
    const result = await getDesktopHostBridge().cancelPiProviderAuthentication(providerId);
    return result.ok;
  } catch (error) {
    piRuntimeStore.getState().setErrorMessage(getErrorMessage(error));
    return false;
  }
}

/** Removes one stored Pi credential and refreshes source/availability state. */
export async function removePiProviderCredential(providerId: string): Promise<PiRuntimeSnapshot | null> {
  piRuntimeStore.getState().setPendingCredentialAction({ kind: "remove", providerId });
  piRuntimeStore.getState().setErrorMessage(undefined);
  try {
    const result = await getDesktopHostBridge().removePiProviderCredential(providerId);
    return applyPiRuntimeSnapshotResult(result, false);
  } catch (error) {
    piRuntimeStore.getState().setErrorMessage(getErrorMessage(error));
    return null;
  } finally {
    piRuntimeStore.getState().setPendingCredentialAction(undefined);
  }
}

function applyPiRuntimeSnapshotResult(
  result: PiRuntimeSnapshotResult,
  suppressCancellation: boolean,
): PiRuntimeSnapshot | null {
  if (!result.ok) {
    if (!suppressCancellation || result.error.code !== "cancelled") {
      piRuntimeStore.getState().setErrorMessage(result.error.message);
    }
    return null;
  }
  piRuntimeStore.getState().setSnapshot(result.snapshot);
  return result.snapshot;
}

/** Persists the Yishan-owned default Pi model selection used for future Pi launches. */
export function setDefaultPiModelPattern(pattern: string): void {
  agentSettingsStore.getState().setDefaultPiModelPattern(pattern);
}

/** Persists the Yishan-owned global default Pi provider used to filter model selection. */
export function setDefaultPiProviderId(providerId: string): void {
  agentSettingsStore.getState().setDefaultPiProviderId(providerId);
}

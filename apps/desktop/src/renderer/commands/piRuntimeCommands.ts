import type { AuthenticatePiProviderInput, PiRuntimeSnapshot } from "../../main/piRuntime/piRuntimeTypes";
import { getErrorMessage } from "../helpers/errorHelpers";
import { getDesktopHostBridge } from "../rpc/rpcTransport";
import { agentSettingsStore } from "../store/settings/agentSettingsStore";
import { piRuntimeStore } from "../store/settings/piRuntimeStore";

const LOGIN_CANCELLED_MESSAGE = "Login cancelled.";

function isLoginCancelledMessage(message: string): boolean {
  return message === LOGIN_CANCELLED_MESSAGE || message.endsWith(`Error: ${LOGIN_CANCELLED_MESSAGE}`);
}

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
    const snapshot = await getDesktopHostBridge().authenticatePiProvider(input);
    piRuntimeStore.getState().setSnapshot(snapshot);
    return snapshot;
  } catch (error) {
    const message = getErrorMessage(error);
    if (!isLoginCancelledMessage(message)) {
      piRuntimeStore.getState().setErrorMessage(message);
    }
    return null;
  } finally {
    piRuntimeStore.getState().setPendingCredentialAction(undefined);
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
    const snapshot = await getDesktopHostBridge().removePiProviderCredential(providerId);
    piRuntimeStore.getState().setSnapshot(snapshot);
    return snapshot;
  } catch (error) {
    piRuntimeStore.getState().setErrorMessage(getErrorMessage(error));
    return null;
  } finally {
    piRuntimeStore.getState().setPendingCredentialAction(undefined);
  }
}

/** Persists the Yishan-owned default Pi model selection used for future Pi launches. */
export function setDefaultPiModelPattern(pattern: string): void {
  agentSettingsStore.getState().setDefaultPiModelPattern(pattern);
}

/** Persists the Yishan-owned global default Pi provider used to filter model selection. */
export function setDefaultPiProviderId(providerId: string): void {
  agentSettingsStore.getState().setDefaultPiProviderId(providerId);
}

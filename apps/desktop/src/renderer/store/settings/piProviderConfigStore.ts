import { create } from "zustand";
import type { PiProviderAuthMethodKind, PiProviderConfigSnapshot } from "../../../shared/contracts/piProviderConfig";

/** Renderer loading state for Pi provider/model snapshots. */
export type PiProviderConfigLoadState = "idle" | "loading" | "refreshing";

/** Credential mutation currently blocking another provider action. */
export type PiProviderConfigPendingCredentialAction =
  | { kind: "authenticate"; providerId: string; method: PiProviderAuthMethodKind }
  | { kind: "remove"; providerId: string };

type PiProviderConfigStoreState = {
  snapshot: PiProviderConfigSnapshot | null;
  loadState: PiProviderConfigLoadState;
  activeLoadRequestId?: number;
  errorMessage?: string;
  pendingCredentialAction?: PiProviderConfigPendingCredentialAction;
  activeCredentialRequestId?: number;
  setSnapshot: (snapshot: PiProviderConfigSnapshot) => void;
  beginLoad: (requestId: number, loadState: Exclude<PiProviderConfigLoadState, "idle">) => void;
  completeLoad: (requestId: number, snapshot: PiProviderConfigSnapshot) => boolean;
  failLoad: (requestId: number, errorMessage: string) => boolean;
  setErrorMessage: (errorMessage?: string) => void;
  beginCredentialOperation: (requestId: number, action: PiProviderConfigPendingCredentialAction) => boolean;
  setCredentialOperationError: (requestId: number, errorMessage?: string) => boolean;
  finishCredentialOperation: (requestId: number) => boolean;
};

/** Stores non-persisted provider/model configuration state for the Desktop AI Chat settings UI. */
export const piProviderConfigStore = create<PiProviderConfigStoreState>((set, get) => ({
  snapshot: null,
  loadState: "idle",
  activeLoadRequestId: undefined,
  errorMessage: undefined,
  pendingCredentialAction: undefined,
  activeCredentialRequestId: undefined,
  setSnapshot: (snapshot) => {
    set({ snapshot, loadState: "idle", activeLoadRequestId: undefined, errorMessage: undefined });
  },
  beginLoad: (activeLoadRequestId, loadState) => {
    set({ activeLoadRequestId, loadState, errorMessage: undefined });
  },
  completeLoad: (requestId, snapshot) => {
    if (get().activeLoadRequestId !== requestId) {
      return false;
    }
    set({ snapshot, loadState: "idle", activeLoadRequestId: undefined, errorMessage: undefined });
    return true;
  },
  failLoad: (requestId, errorMessage) => {
    if (get().activeLoadRequestId !== requestId) {
      return false;
    }
    set({ loadState: "idle", activeLoadRequestId: undefined, errorMessage });
    return true;
  },
  setErrorMessage: (errorMessage) => {
    set({ errorMessage });
  },
  beginCredentialOperation: (activeCredentialRequestId, pendingCredentialAction) => {
    if (get().activeCredentialRequestId !== undefined) {
      return false;
    }
    set({ activeCredentialRequestId, pendingCredentialAction, errorMessage: undefined });
    return true;
  },
  setCredentialOperationError: (requestId, errorMessage) => {
    if (get().activeCredentialRequestId !== requestId) {
      return false;
    }
    set({ errorMessage });
    return true;
  },
  finishCredentialOperation: (requestId) => {
    if (get().activeCredentialRequestId !== requestId) {
      return false;
    }
    set({ activeCredentialRequestId: undefined, pendingCredentialAction: undefined });
    return true;
  },
}));

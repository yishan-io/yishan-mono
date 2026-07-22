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
  beginLoad: (requestId: number, loadState: Exclude<PiProviderConfigLoadState, "idle">) => void;
  completeLoad: (requestId: number, snapshot: PiProviderConfigSnapshot) => void;
  failLoad: (requestId: number, errorMessage: string) => void;
  setErrorMessage: (errorMessage?: string) => void;
  beginCredentialOperation: (action: PiProviderConfigPendingCredentialAction) => boolean;
  finishCredentialOperation: () => void;
};

/** Stores non-persisted provider/model configuration state for the Desktop AI Chat settings UI. */
export const piProviderConfigStore = create<PiProviderConfigStoreState>((set, get) => ({
  snapshot: null,
  loadState: "idle",
  activeLoadRequestId: undefined,
  errorMessage: undefined,
  pendingCredentialAction: undefined,
  beginLoad: (activeLoadRequestId, loadState) => {
    set({ activeLoadRequestId, loadState, errorMessage: undefined });
  },
  completeLoad: (requestId, snapshot) => {
    if (get().activeLoadRequestId !== requestId) {
      return;
    }
    set({ snapshot, loadState: "idle", activeLoadRequestId: undefined, errorMessage: undefined });
  },
  failLoad: (requestId, errorMessage) => {
    if (get().activeLoadRequestId !== requestId) {
      return;
    }
    set({ loadState: "idle", activeLoadRequestId: undefined, errorMessage });
  },
  setErrorMessage: (errorMessage) => {
    set({ errorMessage });
  },
  beginCredentialOperation: (pendingCredentialAction) => {
    if (get().pendingCredentialAction !== undefined) {
      return false;
    }
    set({ pendingCredentialAction, errorMessage: undefined });
    return true;
  },
  finishCredentialOperation: () => {
    set({ pendingCredentialAction: undefined });
  },
}));

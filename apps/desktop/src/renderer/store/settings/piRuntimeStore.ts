import { create } from "zustand";
import type { PiProviderAuthMethodKind, PiRuntimeSnapshot } from "../../../shared/contracts/piRuntime";

/** Renderer loading state for Pi provider/model snapshots. */
export type PiRuntimeLoadState = "idle" | "loading" | "refreshing";

/** Credential mutation currently blocking another provider action. */
export type PiRuntimePendingCredentialAction =
  | { kind: "authenticate"; providerId: string; method: PiProviderAuthMethodKind }
  | { kind: "remove"; providerId: string };

type PiRuntimeStoreState = {
  snapshot: PiRuntimeSnapshot | null;
  loadState: PiRuntimeLoadState;
  activeLoadRequestId?: number;
  errorMessage?: string;
  pendingCredentialAction?: PiRuntimePendingCredentialAction;
  activeCredentialRequestId?: number;
  setSnapshot: (snapshot: PiRuntimeSnapshot) => void;
  beginLoad: (requestId: number, loadState: Exclude<PiRuntimeLoadState, "idle">) => void;
  completeLoad: (requestId: number, snapshot: PiRuntimeSnapshot) => boolean;
  failLoad: (requestId: number, errorMessage: string) => boolean;
  setErrorMessage: (errorMessage?: string) => void;
  beginCredentialOperation: (requestId: number, action: PiRuntimePendingCredentialAction) => boolean;
  setCredentialOperationError: (requestId: number, errorMessage?: string) => boolean;
  finishCredentialOperation: (requestId: number) => boolean;
};

/** Stores non-persisted Pi provider/model runtime state for the Agent connections UI. */
export const piRuntimeStore = create<PiRuntimeStoreState>((set, get) => ({
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

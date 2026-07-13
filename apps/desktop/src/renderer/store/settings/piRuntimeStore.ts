import { create } from "zustand";
import type { PiProviderAuthMethodKind, PiRuntimeSnapshot } from "../../../main/piRuntime/piRuntimeTypes";

export type PiRuntimeLoadState = "idle" | "loading" | "refreshing";

export type PiRuntimePendingCredentialAction =
  | { kind: "authenticate"; providerId: string; method: PiProviderAuthMethodKind }
  | { kind: "remove"; providerId: string };

type PiRuntimeStoreState = {
  snapshot: PiRuntimeSnapshot | null;
  loadState: PiRuntimeLoadState;
  errorMessage?: string;
  pendingCredentialAction?: PiRuntimePendingCredentialAction;
  setSnapshot: (snapshot: PiRuntimeSnapshot) => void;
  setLoadState: (loadState: PiRuntimeLoadState) => void;
  setErrorMessage: (errorMessage?: string) => void;
  setPendingCredentialAction: (action?: PiRuntimePendingCredentialAction) => void;
};

/** Stores non-persisted Pi provider/model runtime state for the Agent connections UI. */
export const piRuntimeStore = create<PiRuntimeStoreState>((set) => ({
  snapshot: null,
  loadState: "idle",
  errorMessage: undefined,
  pendingCredentialAction: undefined,
  setSnapshot: (snapshot) => {
    set({ snapshot, errorMessage: undefined });
  },
  setLoadState: (loadState) => {
    set({ loadState });
  },
  setErrorMessage: (errorMessage) => {
    set({ errorMessage });
  },
  setPendingCredentialAction: (pendingCredentialAction) => {
    set({ pendingCredentialAction });
  },
}));

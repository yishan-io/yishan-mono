import { create } from "zustand";
import type { DSHOfficialPluginBundle, DSHPluginBundle } from "../plugins/dshPlugin";

export type DSHPluginStoreState = {
  bundles: DSHPluginBundle[];
  officialBundles: DSHOfficialPluginBundle[];
  isLoading: boolean;
  error: string | null;
  setLoading: (isLoading: boolean) => void;
  setBundles: (bundles: DSHPluginBundle[]) => void;
  setOfficialBundles: (bundles: DSHOfficialPluginBundle[]) => void;
  setError: (error: string | null) => void;
};

/** Holds rendered state for account-scoped managed DSH bundles. */
export const dshPluginStore = create<DSHPluginStoreState>((set) => ({
  bundles: [],
  officialBundles: [],
  isLoading: false,
  error: null,
  setLoading: (isLoading) => set({ isLoading }),
  setBundles: (bundles) => set({ bundles, error: null }),
  setOfficialBundles: (officialBundles) => set({ officialBundles, error: null }),
  setError: (error) => set({ error }),
}));

import { diffTabContentStore } from "../state/diffTabContentStore";

/** Subscribes to the diff tab content map owned by the Git Domain. */
export function useDiffTabContents() {
  return diffTabContentStore((state) => state.byTabId);
}

import { fileTabContentStore } from "../state/fileTabContentStore";

/** Subscribes to the file tab content map owned by the Files Domain. */
export function useFileTabContents() {
  return fileTabContentStore((state) => state.byTabId);
}

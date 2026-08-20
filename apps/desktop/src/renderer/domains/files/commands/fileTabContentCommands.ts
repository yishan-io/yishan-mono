import { chatStore } from "@renderer/domains/agent";
import { setFileTabDirty } from "@renderer/domains/workbench";
import { type SeedFileTabContentInput, fileTabContentStore } from "../state/fileTabContentStore";

/**
 * Files commands that own editable file tab content (desktop6-adjust.md W6
 * task 16). The Workbench tab descriptor keeps only the file path and the
 * dirty presentation flag; content, saved content, deletion, and unsupported
 * metadata live here in the Files module.
 */

/** Seeds the content store when a file tab opens (called from App composition). */
export function seedFileTabContent(input: SeedFileTabContentInput): void {
  fileTabContentStore.getState().seed(input);
}

/** Updates editable content for one file tab and syncs the tab dirty flag. */
export function updateFileTabContent(tabId: string, content: string): void {
  const isDirty = fileTabContentStore.getState().updateContent(tabId, content);
  if (isDirty !== null) {
    setFileTabDirty(tabId, isDirty);
  }
}

/** Marks one file tab saved by syncing saved content and clearing the dirty flag. */
export function markFileTabSaved(tabId: string): void {
  const isDirty = fileTabContentStore.getState().markSaved(tabId);
  if (isDirty !== null) {
    setFileTabDirty(tabId, isDirty);
  }
}

/** Syncs one open file tab with disk state; the store skips dirty tabs. */
export function refreshFileTabFromDisk(input: {
  tabId: string;
  path?: string;
  content: string;
  deleted: boolean;
}): void {
  fileTabContentStore.getState().refreshFromDisk(input.tabId, {
    path: input.path,
    content: input.content,
    deleted: input.deleted,
  });
}

/** Removes file tab content when the owning Workbench tab closes. */
export function removeFileTabContent(tabIds: string[]): void {
  fileTabContentStore.getState().removeTabData(tabIds);
}

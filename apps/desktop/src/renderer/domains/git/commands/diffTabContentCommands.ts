import type { FileDiffEntry } from "@renderer/domains/workbench";
import { diffTabContentStore } from "../state/diffTabContentStore";

/**
 * Git commands that own diff tab content (desktop6-adjust.md W6 task 16).
 * The Workbench diff tab descriptor keeps only the path and source; the diff
 * payload (old/new content and multi-file entries) lives here in Git.
 */

/** Seeds the diff content store when a diff tab opens (called from App composition). */
export function seedDiffTabContent(input: {
  tabId: string;
  path: string;
  oldContent?: string;
  newContent?: string;
  files?: FileDiffEntry[];
}): void {
  diffTabContentStore.getState().seed(input);
}

/** Syncs one open diff tab content after external changes. */
export function refreshDiffTabContent(input: { tabId: string; oldContent: string; newContent: string }): void {
  diffTabContentStore.getState().update(input.tabId, { oldContent: input.oldContent, newContent: input.newContent });
}

/** Removes diff tab content when the owning Workbench tab closes. */
export function removeDiffTabContent(tabIds: string[]): void {
  diffTabContentStore.getState().removeTabData(tabIds);
}

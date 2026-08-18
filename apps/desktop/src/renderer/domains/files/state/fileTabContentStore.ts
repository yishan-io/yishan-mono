import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export type FileTabContent = {
  path: string;
  content: string;
  savedContent: string;
  isDeleted: boolean;
  isUnsupported?: boolean;
  unsupportedReason?: "type" | "size";
  isIgnored: boolean;
};

export type SeedFileTabContentInput = {
  tabId: string;
  path: string;
  content?: string;
  isUnsupported?: boolean;
  unsupportedReason?: "type" | "size";
  isIgnored?: boolean;
};

export type FileTabContentStoreState = {
  /** File tab payloads keyed by Workbench tab id (desktop6-adjust.md W6 task 16). */
  byTabId: Record<string, FileTabContent>;

  seed: (input: SeedFileTabContentInput) => void;
  /** Updates editable content; returns the new dirty flag for the tab presenter. */
  updateContent: (tabId: string, content: string) => boolean | null;
  /** Marks one tab saved; returns the new dirty flag (always false). */
  markSaved: (tabId: string) => boolean | null;
  /**
   * Syncs one open file tab with disk state. Skips dirty tabs. Returns true
   * when the tab content changed.
   */
  refreshFromDisk: (tabId: string, input: { content: string; deleted: boolean }) => boolean;
  removeTabData: (tabIds: string[]) => void;
};

/** Stores editable file tab content. The tab descriptor keeps only the path. */
export const fileTabContentStore = create<FileTabContentStoreState>()(
  immer((set, get) => ({
    byTabId: {},

    seed: (input) => {
      const content = input.content ?? "";
      set((state) => {
        state.byTabId[input.tabId] = {
          path: input.path,
          content,
          savedContent: content,
          isDeleted: false,
          isUnsupported: input.isUnsupported,
          unsupportedReason: input.unsupportedReason,
          isIgnored: input.isIgnored ?? false,
        };
      });
    },

    updateContent: (tabId, content) => {
      const entry = get().byTabId[tabId];
      if (!entry) {
        return null;
      }
      const isDirty = content !== entry.savedContent;
      set((state) => {
        const target = state.byTabId[tabId];
        if (!target) {
          return;
        }
        target.content = content;
        target.isDeleted = false;
      });
      return isDirty;
    },

    markSaved: (tabId) => {
      const entry = get().byTabId[tabId];
      if (!entry) {
        return null;
      }
      set((state) => {
        const target = state.byTabId[tabId];
        if (!target) {
          return;
        }
        target.savedContent = target.content;
        target.isDeleted = false;
      });
      return false;
    },

    refreshFromDisk: (tabId, input) => {
      const entry = get().byTabId[tabId];
      if (!entry) {
        return false;
      }
      // Never clobber unsaved edits with disk state.
      if (entry.content !== entry.savedContent) {
        return false;
      }
      const nextContent = input.deleted ? "" : input.content;
      if (entry.content === nextContent && !!entry.isDeleted === input.deleted) {
        return false;
      }
      set((state) => {
        const target = state.byTabId[tabId];
        if (!target) {
          return;
        }
        target.content = nextContent;
        target.savedContent = nextContent;
        target.isDeleted = input.deleted;
      });
      return true;
    },

    removeTabData: (tabIds) => {
      const removed = new Set(tabIds);
      set((state) => {
        for (const tabId of Object.keys(state.byTabId)) {
          if (removed.has(tabId)) {
            delete state.byTabId[tabId];
          }
        }
      });
    },
  })),
);

import type { FileDiffEntry } from "@renderer/domains/workbench";
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export type DiffTabContent = {
  path: string;
  oldContent: string;
  newContent: string;
  files?: FileDiffEntry[];
};

export type SeedDiffTabContentInput = {
  tabId: string;
  path: string;
  oldContent?: string;
  newContent?: string;
  files?: FileDiffEntry[];
};

export type DiffTabContentStoreState = {
  /** Diff tab payloads keyed by Workbench tab id (desktop6-adjust.md W6 task 16). */
  byTabId: Record<string, DiffTabContent>;

  seed: (input: SeedDiffTabContentInput) => void;
  /** Syncs one open diff tab content after external changes. */
  update: (tabId: string, input: { path?: string; oldContent: string; newContent: string }) => void;
  removeTabData: (tabIds: string[]) => void;
};

/** Stores editable diff tab content. The tab descriptor keeps only the path. */
export const diffTabContentStore = create<DiffTabContentStoreState>()(
  immer((set, get) => ({
    byTabId: {},

    seed: (input) => {
      set((state) => {
        state.byTabId[input.tabId] = {
          path: input.path,
          oldContent: input.oldContent ?? "",
          newContent: input.newContent ?? "",
          files: input.files,
        };
      });
    },

    update: (tabId, input: { path?: string; oldContent: string; newContent: string }) => {
      const entry = get().byTabId[tabId];
      if (!entry) {
        // Never seeded (changes-tab / diff-view open paths do not seed): create
        // the entry from the diff payload so the viewer shows real content.
        if (!input.path) {
          return;
        }
        set((state) => {
          state.byTabId[tabId] = {
            path: input.path ?? "",
            oldContent: input.oldContent,
            newContent: input.newContent,
            files: undefined,
          };
        });
        return;
      }
      if (entry.oldContent === input.oldContent && entry.newContent === input.newContent) {
        return;
      }
      set((state) => {
        const target = state.byTabId[tabId];
        if (!target) {
          return;
        }
        target.oldContent = input.oldContent;
        target.newContent = input.newContent;
      });
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

import { parseDiffFromFile } from "@pierre/diffs";
import type { CodeViewDiffItem } from "@pierre/diffs";
import type { FileDiffEntry } from "../../store/types";

/** Metadata displayed in each multi-file diff header. */
export type MultiFileDiffMeta = {
  additions: number;
  deletions: number;
  changeKind: string;
};

/** Aggregate diff totals for the current file list. */
export type MultiFileDiffTotals = {
  additions: number;
  deletions: number;
};

/** Creates the initial collapsed file set for the diff viewer. */
export function createInitialCollapsedKeys(files: FileDiffEntry[]): Set<string> {
  const initial = new Set<string>();
  for (const file of files) {
    if (file.changeKind === "deleted") {
      initial.add(file.path);
    }
  }
  return initial;
}

/** Maps file paths to the metadata displayed in each custom header. */
export function createFileMetaByPath(files: FileDiffEntry[]): Map<string, MultiFileDiffMeta> {
  const fileMetaByPath = new Map<string, MultiFileDiffMeta>();
  for (const file of files) {
    fileMetaByPath.set(file.path, {
      additions: file.additions,
      deletions: file.deletions,
      changeKind: file.changeKind,
    });
  }
  return fileMetaByPath;
}

/** Builds the code view items used to render the combined diff. */
export function createCodeViewItems(files: FileDiffEntry[]): CodeViewDiffItem[] {
  return files.map((file) => ({
    id: file.path,
    type: "diff" as const,
    fileDiff: parseDiffFromFile(
      { name: file.path, contents: file.oldContent },
      { name: file.path, contents: file.newContent },
    ),
    collapsed: file.changeKind === "deleted",
    version: 0,
  }));
}

/** Sums additions and deletions across the current file list. */
export function getDiffTotals(files: FileDiffEntry[]): MultiFileDiffTotals {
  return files.reduce(
    (totals, file) => ({
      additions: totals.additions + file.additions,
      deletions: totals.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  );
}

/** Converts a change kind into the label shown in the file header. */
export function getChangeKindLabel(changeKind: string | undefined): string {
  if (changeKind === "added") return "Added";
  if (changeKind === "deleted") return "Deleted";
  if (changeKind === "renamed") return "Renamed";
  return "";
}

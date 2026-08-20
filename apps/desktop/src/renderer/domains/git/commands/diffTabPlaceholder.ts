import type { DiffFileChangeKind } from "../../workbench";

function getFileName(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").pop() ?? path;
}

function clampLineCount(value: number): number {
  return Math.max(1, Math.min(value, 12));
}

/**
 * Produces minimal placeholder diff content for a diff tab opened without
 * pre-loaded content. Real diff payloads replace it via
 * `refreshDiffTabContent` (desktop6-adjust.md W6 task 16).
 */
export function createDiffTabPlaceholder(input: {
  path: string;
  kind: DiffFileChangeKind;
  additions: number;
  deletions: number;
}): { oldContent: string; newContent: string } {
  const fileName = getFileName(input.path);
  const normalizedAdditions = clampLineCount(input.additions);
  const normalizedDeletions = clampLineCount(input.deletions);

  if (input.kind === "added") {
    const addedLines = Array.from(
      { length: normalizedAdditions },
      (_, index) => `const addedLine${index + 1} = "${fileName} line ${index + 1}";`,
    );
    return {
      oldContent: "",
      newContent: [`// ${input.path}`, ...addedLines].join("\n"),
    };
  }

  if (input.kind === "deleted") {
    const deletedLines = Array.from(
      { length: normalizedDeletions },
      (_, index) => `const removedLine${index + 1} = "${fileName} line ${index + 1}";`,
    );
    return {
      oldContent: [`// ${input.path}`, ...deletedLines].join("\n"),
      newContent: "",
    };
  }

  const removedLines = Array.from(
    { length: normalizedDeletions },
    (_, index) => `const beforeLine${index + 1} = "${fileName} old ${index + 1}";`,
  );
  const addedLines = Array.from(
    { length: normalizedAdditions },
    (_, index) => `const afterLine${index + 1} = "${fileName} new ${index + 1}";`,
  );

  return {
    oldContent: [`// ${input.path}`, ...removedLines].join("\n"),
    newContent: [`// ${input.path}`, ...addedLines].join("\n"),
  };
}

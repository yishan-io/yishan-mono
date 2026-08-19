import type { ChangeContent, ContextContent, FileDiffMetadata, Hunk, SelectionSide } from "@pierre/diffs";
import { parseDiffFromFile } from "@pierre/diffs";

export type DiffVisualLine = {
  /** 1-based visual line number in the diff view (first content line = 1) */
  visualLineNumber: number;
  /** Which side of the diff in split mode; undefined in unified mode */
  side?: SelectionSide;
  /** The text content of this line */
  content: string;
  /** File identifier (typically the file path) */
  fileId: string;
};

export type DiffMatch = {
  /** File identifier */
  fileId: string;
  /** 1-based visual line number in the diff view */
  visualLineNumber: number;
  /** Side in split mode; undefined in unified mode */
  side?: SelectionSide;
  /** 0-based character offset within the line content */
  column: number;
  /** Length of the match */
  length: number;
};

function isChangeContent(segment: ContextContent | ChangeContent): segment is ChangeContent {
  return segment.type === "change";
}

function buildUnifiedVisualLinesForHunk(fileDiff: FileDiffMetadata, hunk: Hunk, fileId: string): DiffVisualLine[] {
  const lines: DiffVisualLine[] = [];
  let visualLine = hunk.unifiedLineStart + 1;

  for (const segment of hunk.hunkContent) {
    if (isChangeContent(segment)) {
      for (let i = 0; i < segment.deletions; i++) {
        const content = fileDiff.deletionLines[segment.deletionLineIndex + i];
        if (content !== undefined) {
          lines.push({ visualLineNumber: visualLine, content, fileId });
        }
        visualLine++;
      }
      for (let i = 0; i < segment.additions; i++) {
        const content = fileDiff.additionLines[segment.additionLineIndex + i];
        if (content !== undefined) {
          lines.push({ visualLineNumber: visualLine, content, fileId });
        }
        visualLine++;
      }
    } else {
      for (let i = 0; i < segment.lines; i++) {
        const content = fileDiff.deletionLines[segment.deletionLineIndex + i];
        if (content !== undefined) {
          lines.push({ visualLineNumber: visualLine, content, fileId });
        }
        visualLine++;
      }
    }
  }

  return lines;
}

function buildSplitVisualLinesForHunk(fileDiff: FileDiffMetadata, hunk: Hunk, fileId: string): DiffVisualLine[] {
  const lines: DiffVisualLine[] = [];
  let visualLine = hunk.splitLineStart + 1;

  for (const segment of hunk.hunkContent) {
    if (isChangeContent(segment)) {
      const pairCount = Math.max(segment.deletions, segment.additions);
      for (let i = 0; i < pairCount; i++) {
        if (i < segment.deletions) {
          const content = fileDiff.deletionLines[segment.deletionLineIndex + i];
          if (content !== undefined) {
            lines.push({ visualLineNumber: visualLine, side: "deletions", content, fileId });
          }
        }
        if (i < segment.additions) {
          const content = fileDiff.additionLines[segment.additionLineIndex + i];
          if (content !== undefined) {
            lines.push({ visualLineNumber: visualLine, side: "additions", content, fileId });
          }
        }
        visualLine++;
      }
    } else {
      for (let i = 0; i < segment.lines; i++) {
        const delContent = fileDiff.deletionLines[segment.deletionLineIndex + i];
        if (delContent !== undefined) {
          lines.push({ visualLineNumber: visualLine, side: "deletions", content: delContent, fileId });
        }
        const addContent = fileDiff.additionLines[segment.additionLineIndex + i];
        if (addContent !== undefined) {
          lines.push({ visualLineNumber: visualLine, side: "additions", content: addContent, fileId });
        }
        visualLine++;
      }
    }
  }

  return lines;
}

function buildVisualLinesFromFileDiff(
  fileDiff: FileDiffMetadata,
  fileId: string,
  sideBySide: boolean,
): DiffVisualLine[] {
  const lines: DiffVisualLine[] = [];
  const builder = sideBySide ? buildSplitVisualLinesForHunk : buildUnifiedVisualLinesForHunk;

  for (const hunk of fileDiff.hunks) {
    lines.push(...builder(fileDiff, hunk, fileId));
  }

  return lines;
}

export type FindDiffMatchesFileInput = {
  oldContent: string;
  newContent: string;
  fileId: string;
};

/**
 * Builds a flat list of all visible diff lines and searches for text matches.
 * Returns matches with their visual line positions so the consumer can navigate
 * to each match.
 */
export function findDiffMatches(
  files: FindDiffMatchesFileInput[],
  query: string,
  caseSensitive: boolean,
  sideBySide: boolean,
): DiffMatch[] {
  const effectiveQuery = caseSensitive ? query : query.toLowerCase();
  if (!effectiveQuery) return [];

  const allLines: DiffVisualLine[] = [];

  for (const file of files) {
    const fileDiff = parseDiffFromFile(
      { name: file.fileId, contents: file.oldContent },
      { name: file.fileId, contents: file.newContent },
    );
    const lines = buildVisualLinesFromFileDiff(fileDiff, file.fileId, sideBySide);
    allLines.push(...lines);
  }

  const matches: DiffMatch[] = [];

  for (const line of allLines) {
    const searchText = caseSensitive ? line.content : line.content.toLowerCase();
    let searchIndex = 0;

    while (true) {
      const foundIndex = searchText.indexOf(effectiveQuery, searchIndex);
      if (foundIndex === -1) break;

      matches.push({
        fileId: line.fileId,
        visualLineNumber: line.visualLineNumber,
        side: line.side,
        column: foundIndex,
        length: effectiveQuery.length,
      });

      searchIndex = foundIndex + 1;
    }
  }

  return matches;
}

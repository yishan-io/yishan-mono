/**
 * One rendered line kind in the mobile unified diff preview.
 */
export type UnifiedDiffLineKind = "hunk" | "context" | "added" | "deleted";

/**
 * One rendered unified diff line in the mobile file preview.
 */
export type UnifiedDiffLine = {
  kind: UnifiedDiffLineKind;
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
};

type DiffOp = {
  kind: "context" | "added" | "deleted";
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
};

const CONTEXT_LINE_COUNT = 2;

/**
 * Builds a bounded unified diff model for mobile workspace preview rendering.
 */
export function buildUnifiedDiffLines(oldContent: string, newContent: string): UnifiedDiffLine[] {
  if (oldContent === newContent) {
    return [];
  }

  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const ops = buildDiffOps(oldLines, newLines);

  return buildHunkLines(ops);
}

function buildHunkLines(ops: DiffOp[]): UnifiedDiffLine[] {
  const lines: UnifiedDiffLine[] = [];
  let index = 0;

  while (index < ops.length) {
    while (index < ops.length && ops[index]?.kind === "context") {
      index += 1;
    }

    if (index >= ops.length) {
      break;
    }

    const hunkStart = Math.max(0, index - CONTEXT_LINE_COUNT);
    let hunkEnd = ops.length - 1;
    let trailingContextCount = 0;

    for (let cursor = index; cursor < ops.length; cursor += 1) {
      if (ops[cursor]?.kind === "context") {
        trailingContextCount += 1;
        if (trailingContextCount > CONTEXT_LINE_COUNT) {
          hunkEnd = cursor - trailingContextCount + CONTEXT_LINE_COUNT;
          break;
        }
      } else {
        trailingContextCount = 0;
      }

      hunkEnd = cursor;
    }

    const hunkOps = ops.slice(hunkStart, hunkEnd + 1);
    lines.push(buildHunkHeader(hunkOps), ...hunkOps);
    index = hunkEnd + 1;
  }

  return lines;
}

function buildHunkHeader(hunkOps: DiffOp[]): UnifiedDiffLine {
  const firstOldLine = hunkOps.find((line) => line.oldLineNumber !== null)?.oldLineNumber ?? 0;
  const firstNewLine = hunkOps.find((line) => line.newLineNumber !== null)?.newLineNumber ?? 0;
  const oldStart = firstOldLine || (hunkOps.find((line) => line.newLineNumber !== null)?.newLineNumber ?? 1) - 1;
  const newStart = firstNewLine || (hunkOps.find((line) => line.oldLineNumber !== null)?.oldLineNumber ?? 1) - 1;
  const oldLength = hunkOps.filter((line) => line.oldLineNumber !== null).length;
  const newLength = hunkOps.filter((line) => line.newLineNumber !== null).length;

  return {
    kind: "hunk",
    content: `@@ -${oldStart},${oldLength} +${newStart},${newLength} @@`,
    oldLineNumber: null,
    newLineNumber: null,
  };
}

function buildDiffOps(oldLines: string[], newLines: string[]): DiffOp[] {
  const prefixLength = countSharedPrefix(oldLines, newLines);
  const suffixLength = countSharedSuffix(oldLines, newLines, prefixLength);
  const oldMiddle = oldLines.slice(prefixLength, oldLines.length - suffixLength);
  const newMiddle = newLines.slice(prefixLength, newLines.length - suffixLength);
  const pairs = computeLcsPairs(oldMiddle, newMiddle);
  const ops: DiffOp[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  for (let index = 0; index < prefixLength; index += 1) {
    ops.push({
      kind: "context",
      content: oldLines[index] ?? "",
      oldLineNumber: index + 1,
      newLineNumber: index + 1,
    });
  }

  for (const [matchedOldIndex, matchedNewIndex] of [...pairs, [oldMiddle.length, newMiddle.length] as const]) {
    while (oldIndex < matchedOldIndex) {
      ops.push({
        kind: "deleted",
        content: oldMiddle[oldIndex] ?? "",
        oldLineNumber: prefixLength + oldIndex + 1,
        newLineNumber: null,
      });
      oldIndex += 1;
    }

    while (newIndex < matchedNewIndex) {
      ops.push({
        kind: "added",
        content: newMiddle[newIndex] ?? "",
        oldLineNumber: null,
        newLineNumber: prefixLength + newIndex + 1,
      });
      newIndex += 1;
    }

    if (matchedOldIndex < oldMiddle.length && matchedNewIndex < newMiddle.length) {
      ops.push({
        kind: "context",
        content: oldMiddle[matchedOldIndex] ?? "",
        oldLineNumber: prefixLength + matchedOldIndex + 1,
        newLineNumber: prefixLength + matchedNewIndex + 1,
      });
    }

    oldIndex = matchedOldIndex + 1;
    newIndex = matchedNewIndex + 1;
  }

  for (let index = 0; index < suffixLength; index += 1) {
    ops.push({
      kind: "context",
      content: oldLines[oldLines.length - suffixLength + index] ?? "",
      oldLineNumber: oldLines.length - suffixLength + index + 1,
      newLineNumber: newLines.length - suffixLength + index + 1,
    });
  }

  return ops;
}

function countSharedPrefix(oldLines: string[], newLines: string[]) {
  let prefixLength = 0;
  const maxLength = Math.min(oldLines.length, newLines.length);

  while (prefixLength < maxLength && oldLines[prefixLength] === newLines[prefixLength]) {
    prefixLength += 1;
  }

  return prefixLength;
}

function countSharedSuffix(oldLines: string[], newLines: string[], prefixLength: number) {
  let suffixLength = 0;
  const maxLength = Math.min(oldLines.length, newLines.length);

  while (
    suffixLength < maxLength - prefixLength &&
    oldLines[oldLines.length - 1 - suffixLength] === newLines[newLines.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  return suffixLength;
}

function computeLcsPairs(oldLines: string[], newLines: string[]): Array<[number, number]> {
  const rowCount = oldLines.length;
  const colCount = newLines.length;
  if (rowCount * colCount > 1_000_000) {
    return [];
  }

  const table: number[][] = Array.from({ length: rowCount + 1 }, () => new Array(colCount + 1).fill(0));

  for (let row = 1; row <= rowCount; row += 1) {
    const currentRow = table[row];
    const previousRow = table[row - 1];
    if (!currentRow || !previousRow) {
      continue;
    }

    for (let column = 1; column <= colCount; column += 1) {
      if (oldLines[row - 1] === newLines[column - 1]) {
        currentRow[column] = (previousRow[column - 1] ?? 0) + 1;
      } else {
        currentRow[column] = Math.max(previousRow[column] ?? 0, currentRow[column - 1] ?? 0);
      }
    }
  }

  const pairs: Array<[number, number]> = [];
  let row = rowCount;
  let column = colCount;
  while (row > 0 && column > 0) {
    const currentRow = table[row];
    const previousRow = table[row - 1];
    if (!currentRow || !previousRow) {
      break;
    }

    if (oldLines[row - 1] === newLines[column - 1]) {
      pairs.push([row - 1, column - 1]);
      row -= 1;
      column -= 1;
      continue;
    }

    if ((previousRow[column] ?? 0) >= (currentRow[column - 1] ?? 0)) {
      row -= 1;
    } else {
      column -= 1;
    }
  }

  return pairs.reverse();
}

/**
 * Computes line-level git change indicators by comparing the git HEAD content
 * (old) with the current editor content (new). Uses a simple diff algorithm
 * to produce per-line change types suitable for editor gutter decorations.
 */

export type GitLineChangeKind = "added" | "modified" | "deleted";

export type GitLineChange = {
  /** 1-based line number in the new (current) content. */
  lineNumber: number;
  kind: GitLineChangeKind;
};

/**
 * Computes line-level git change indicators between the committed content and
 * the current editor content. Returns a sorted array of line changes.
 *
 * The algorithm walks the unified diff hunks and classifies each changed line:
 * - Lines only in the new content → "added"
 * - Lines only in the old content → "deleted" (reported at the line after deletion point)
 * - Lines present in both but with different content → "modified"
 */
export function computeGitLineChanges(oldContent: string, newContent: string): GitLineChange[] {
  if (oldContent === newContent) return [];

  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  const changes: GitLineChange[] = [];
  const hunks = computeDiffHunks(oldLines, newLines);

  for (const hunk of hunks) {
    const removedCount = hunk.oldLength;
    const addedCount = hunk.newLength;

    if (removedCount === 0 && addedCount > 0) {
      // Pure addition
      for (let i = 0; i < addedCount; i++) {
        changes.push({ lineNumber: hunk.newStart + i, kind: "added" });
      }
    } else if (removedCount > 0 && addedCount === 0) {
      // Pure deletion – mark at the line where content was removed
      const deletionLine = hunk.newStart;
      changes.push({ lineNumber: deletionLine, kind: "deleted" });
    } else {
      // Mix of removed/added lines → modified
      const modifiedCount = Math.min(removedCount, addedCount);
      for (let i = 0; i < modifiedCount; i++) {
        changes.push({ lineNumber: hunk.newStart + i, kind: "modified" });
      }
      if (addedCount > modifiedCount) {
        // Extra lines added beyond the modified ones
        for (let i = modifiedCount; i < addedCount; i++) {
          changes.push({ lineNumber: hunk.newStart + i, kind: "added" });
        }
      }
      if (removedCount > modifiedCount) {
        // Extra lines deleted beyond the modified ones
        // Already represented in the modified range, no separate marker needed
      }
    }
  }

  return changes;
}

// ─── Internal diff algorithm ─────────────────────────────────────────────────

export type DiffHunk = {
  /** 1-based start line in the old content. */
  oldStart: number;
  /** Number of old lines in the hunk. */
  oldLength: number;
  /** 1-based start line in the new content. */
  newStart: number;
  /** Number of new lines in the hunk. */
  newLength: number;
};

/**
 * Finds the diff hunk that contains a given 1-based line number in the new content.
 * Returns the hunk and the corresponding old lines from the original content,
 * or null if the line isn't part of any change.
 */
export function getHunkForLine(
  oldContent: string,
  newContent: string,
  lineNumber: number,
): { hunk: DiffHunk; oldLines: string[]; newLines: string[] } | null {
  if (oldContent === newContent) return null;

  const oldLinesArr = oldContent.split("\n");
  const newLinesArr = newContent.split("\n");
  const hunks = computeDiffHunks(oldLinesArr, newLinesArr);

  for (const hunk of hunks) {
    const hunkNewEnd = hunk.newStart + Math.max(hunk.newLength - 1, 0);
    // For deletions (newLength === 0), the hunk is reported at newStart
    if (hunk.newLength === 0) {
      if (lineNumber === hunk.newStart) {
        return {
          hunk,
          oldLines: oldLinesArr.slice(hunk.oldStart - 1, hunk.oldStart - 1 + hunk.oldLength),
          newLines: [],
        };
      }
    } else if (lineNumber >= hunk.newStart && lineNumber <= hunkNewEnd) {
      return {
        hunk,
        oldLines: oldLinesArr.slice(hunk.oldStart - 1, hunk.oldStart - 1 + hunk.oldLength),
        newLines: newLinesArr.slice(hunk.newStart - 1, hunk.newStart - 1 + hunk.newLength),
      };
    }
  }

  return null;
}

/**
 * Computes contiguous diff hunks between two arrays of lines.
 * Uses a simple LCS approach with common prefix/suffix optimization.
 */
function computeDiffHunks(oldLines: string[], newLines: string[]): DiffHunk[] {
  // Trim common prefix
  let prefixLen = 0;
  const minLen = Math.min(oldLines.length, newLines.length);
  while (prefixLen < minLen && oldLines[prefixLen] === newLines[prefixLen]) {
    prefixLen++;
  }

  // Trim common suffix
  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    oldLines[oldLines.length - 1 - suffixLen] === newLines[newLines.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  // The remaining "middle" slices to diff
  const oldMiddle = oldLines.slice(prefixLen, oldLines.length - suffixLen);
  const newMiddle = newLines.slice(prefixLen, newLines.length - suffixLen);

  if (oldMiddle.length === 0 && newMiddle.length === 0) {
    return [];
  }

  // For the middle section, compute LCS to find fine-grained hunks
  const lcs = computeLCS(oldMiddle, newMiddle);
  return buildHunksFromLCS(oldMiddle, newMiddle, lcs, prefixLen);
}

/**
 * Compute the Longest Common Subsequence table between two arrays of lines.
 * Returns an array of matched index pairs.
 */
function computeLCS(oldLines: string[], newLines: string[]): Array<[number, number]> {
  const N = oldLines.length;
  const M = newLines.length;

  // For very large diffs, skip LCS and treat the entire range as changed
  if (N * M > 10_000_000) {
    return [];
  }

  // DP with space optimization: we only need the previous row
  const prev = new Uint16Array(M + 1);
  const curr = new Uint16Array(M + 1);

  // First pass: compute LCS length
  for (let i = 1; i <= N; i++) {
    // Swap prev/curr
    prev.set(curr);
    curr.fill(0);
    for (let j = 1; j <= M; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        curr[j] = (prev[j - 1] ?? 0) + 1;
      } else {
        curr[j] = Math.max(prev[j] ?? 0, curr[j - 1] ?? 0);
      }
    }
  }

  // We need to reconstruct the LCS, so recompute with full table for smaller inputs
  // or use a divide-and-conquer approach for larger ones
  if (N * M <= 1_000_000) {
    return reconstructLCSFull(oldLines, newLines);
  }

  // For medium-large inputs, use the simple prefix/suffix + treat-as-changed approach
  return [];
}

/**
 * Full LCS reconstruction using a DP table (for small-to-medium inputs).
 */
function reconstructLCSFull(oldLines: string[], newLines: string[]): Array<[number, number]> {
  const N = oldLines.length;
  const M = newLines.length;

  // Build DP table
  const dp: number[][] = Array.from({ length: N + 1 }, () => new Array(M + 1).fill(0) as number[]);

  for (let i = 1; i <= N; i++) {
    const currentRow = dp[i];
    const previousRow = dp[i - 1];
    if (!currentRow || !previousRow) {
      continue;
    }
    for (let j = 1; j <= M; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        currentRow[j] = (previousRow[j - 1] ?? 0) + 1;
      } else {
        currentRow[j] = Math.max(previousRow[j] ?? 0, currentRow[j - 1] ?? 0);
      }
    }
  }

  // Backtrack to find the actual LCS pairs
  const pairs: Array<[number, number]> = [];
  let i = N;
  let j = M;
  while (i > 0 && j > 0) {
    const currentRow = dp[i];
    const previousRow = dp[i - 1];
    if (!currentRow || !previousRow) {
      break;
    }
    if (oldLines[i - 1] === newLines[j - 1]) {
      pairs.unshift([i - 1, j - 1]);
      i--;
      j--;
    } else if ((previousRow[j] ?? 0) >= (currentRow[j - 1] ?? 0)) {
      i--;
    } else {
      j--;
    }
  }

  return pairs;
}

/**
 * Builds diff hunks from matched LCS pairs. Unmatched regions between
 * consecutive matches become hunks.
 */
function buildHunksFromLCS(
  oldMiddle: string[],
  newMiddle: string[],
  lcsPairs: Array<[number, number]>,
  prefixLen: number,
): DiffHunk[] {
  const hunks: DiffHunk[] = [];

  // If no LCS, the entire middle is one hunk
  if (lcsPairs.length === 0) {
    if (oldMiddle.length > 0 || newMiddle.length > 0) {
      hunks.push({
        oldStart: prefixLen + 1,
        oldLength: oldMiddle.length,
        newStart: prefixLen + 1,
        newLength: newMiddle.length,
      });
    }
    return hunks;
  }

  let oldIdx = 0;
  let newIdx = 0;

  for (const [oldMatch, newMatch] of lcsPairs) {
    // Everything before this match is a change
    if (oldIdx < oldMatch || newIdx < newMatch) {
      hunks.push({
        oldStart: prefixLen + oldIdx + 1,
        oldLength: oldMatch - oldIdx,
        newStart: prefixLen + newIdx + 1,
        newLength: newMatch - newIdx,
      });
    }
    oldIdx = oldMatch + 1;
    newIdx = newMatch + 1;
  }

  // Trailing changes after the last match
  if (oldIdx < oldMiddle.length || newIdx < newMiddle.length) {
    hunks.push({
      oldStart: prefixLen + oldIdx + 1,
      oldLength: oldMiddle.length - oldIdx,
      newStart: prefixLen + newIdx + 1,
      newLength: newMiddle.length - newIdx,
    });
  }

  return hunks;
}

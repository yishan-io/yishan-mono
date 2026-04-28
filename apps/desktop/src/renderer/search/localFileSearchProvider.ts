import type { FileSearchProvider, FileSearchResult } from "./types";

type SubsequenceMatch = {
  indexes: number[];
  score: number;
};

function compactPathQuery(query: string): string {
  return query.replace(/[\\/\s]+/g, "");
}

/**
 * Resolves a fuzzy/substring subsequence match and returns highlight indexes in target text.
 */
function resolveSubsequenceMatch(target: string, query: string): SubsequenceMatch | null {
  const contiguousStart = target.indexOf(query);
  let contiguous: SubsequenceMatch | null = null;

  if (contiguousStart >= 0) {
    const indexes = Array.from({ length: query.length }, (_, index) => contiguousStart + index);
    contiguous = {
      indexes,
      score: 700 - contiguousStart * 2 - target.length,
    };
  }

  const indexes: number[] = [];
  let nextIndex = 0;

  for (const character of query) {
    const foundIndex = target.indexOf(character, nextIndex);
    if (foundIndex < 0) {
      return contiguous;
    }

    indexes.push(foundIndex);
    nextIndex = foundIndex + 1;
  }

  const firstIndex = indexes[0] ?? 0;
  const lastIndex = indexes.at(-1) ?? firstIndex;
  const spread = lastIndex - firstIndex - query.length + 1;
  const subsequenceScore = 500 - spread * 3 - firstIndex * 2 - target.length;
  const subsequence: SubsequenceMatch = {
    indexes,
    score: subsequenceScore,
  };

  if (!contiguous) {
    return subsequence;
  }

  return contiguous.score >= subsequence.score ? contiguous : subsequence;
}

/**
 * Computes a ranked fuzzy search result for a single file path.
 */
function resolveFilePathMatch(path: string, query: string): FileSearchResult | null {
  if (!query) {
    return {
      path,
      score: -path.length,
      highlightedPathIndexes: [],
    };
  }

  const matchPath = path.replace(/\/+$/, "");
  const normalizedPath = matchPath.toLowerCase();
  const filenameStart = matchPath.lastIndexOf("/") + 1;
  const normalizedFilename = normalizedPath.slice(filenameStart);

  const filenameMatch = resolveSubsequenceMatch(normalizedFilename, query);
  if (filenameMatch) {
    return {
      path,
      score: 2_000 + filenameMatch.score,
      highlightedPathIndexes: filenameMatch.indexes.map((index) => filenameStart + index),
    };
  }

  const pathQuery = compactPathQuery(query);
  const pathMatch = resolveSubsequenceMatch(normalizedPath, pathQuery);
  if (!pathMatch) {
    return null;
  }

  return {
    path,
    score: 1_000 + pathMatch.score,
    highlightedPathIndexes: pathMatch.indexes,
  };
}

/**
 * Performs local renderer-side fuzzy search ranked by filename first and path second.
 */
function searchFiles(paths: string[], rawQuery: string): FileSearchResult[] {
  const query = rawQuery.trim().toLowerCase();

  return paths
    .map((path) => resolveFilePathMatch(path, query))
    .filter((result): result is FileSearchResult => Boolean(result))
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      if (left.path.length !== right.path.length) {
        return left.path.length - right.path.length;
      }

      return left.path.localeCompare(right.path);
    });
}

/**
 * Default file search provider backed by local fuzzy search.
 */
export const localFileSearchProvider: FileSearchProvider = {
  searchFiles,
};

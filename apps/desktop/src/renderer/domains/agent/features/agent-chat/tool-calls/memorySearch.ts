/** Parsed memory search result row rendered in the expanded memory tool card. */
export type MemorySearchMatch = {
  path: string;
  snippet: string;
  score: number;
};

/** Parses memory-search JSON output into structured matches when possible. */
export function parseMemorySearchMatches(resultText: string): MemorySearchMatch[] {
  if (!resultText.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(resultText);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((candidate) => {
      if (
        !candidate ||
        typeof candidate !== "object" ||
        typeof candidate.path !== "string" ||
        typeof candidate.snippet !== "string" ||
        typeof candidate.score !== "number"
      ) {
        return [];
      }

      return [
        {
          path: candidate.path,
          snippet: candidate.snippet,
          score: candidate.score,
        },
      ];
    });
  } catch {
    return [];
  }
}

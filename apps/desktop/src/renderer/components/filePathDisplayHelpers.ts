export type HighlightedPathSegment = {
  text: string;
  highlighted: boolean;
};

export type FilePathDisplayParts = {
  filename: string;
  directory: string;
  filenameStart: number;
};

/**
 * Splits one workspace path into filename and directory parts used in file result rows.
 */
export function splitFilePathForDisplay(path: string): FilePathDisplayParts {
  const displayPath = path.replace(/\/+$/, "");
  const slashIndex = displayPath.lastIndexOf("/");

  if (slashIndex < 0) {
    return {
      filename: displayPath,
      directory: "",
      filenameStart: 0,
    };
  }

  return {
    filename: displayPath.slice(slashIndex + 1),
    directory: displayPath.slice(0, slashIndex + 1),
    filenameStart: slashIndex + 1,
  };
}

/**
 * Splits a file path into contiguous highlighted and non-highlighted text segments.
 */
export function buildHighlightedPathSegments(path: string, highlightedIndexes: number[]): HighlightedPathSegment[] {
  if (highlightedIndexes.length === 0) {
    return [{ text: path, highlighted: false }];
  }

  const highlightedSet = new Set(highlightedIndexes);
  const segments: HighlightedPathSegment[] = [];
  let activeHighlighted = highlightedSet.has(0);
  let currentText = "";

  for (let index = 0; index < path.length; index += 1) {
    const character = path[index];
    const isHighlighted = highlightedSet.has(index);

    if (isHighlighted !== activeHighlighted && currentText) {
      segments.push({
        text: currentText,
        highlighted: activeHighlighted,
      });
      currentText = "";
      activeHighlighted = isHighlighted;
    }

    currentText += character;
  }

  if (currentText) {
    segments.push({
      text: currentText,
      highlighted: activeHighlighted,
    });
  }

  return segments;
}

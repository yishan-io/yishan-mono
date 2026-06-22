const ASCII_ESCAPE_CODE = 27;
const ASCII_BELL_CODE = 7;
function findEscapeSequenceEnd(data: string, escapeIndex: number): number | null {
  const next = data[escapeIndex + 1];
  if (next === "[") {
    for (let index = escapeIndex + 2; index < data.length; index += 1) {
      const code = data.charCodeAt(index);
      if (code >= 0x40 && code <= 0x7e) {
        return index;
      }
    }

    return null;
  }

  if (next === "]") {
    for (let index = escapeIndex + 2; index < data.length; index += 1) {
      const code = data.charCodeAt(index);
      if (code === ASCII_BELL_CODE) {
        return index;
      }

      if (code === ASCII_ESCAPE_CODE && data[index + 1] === "\\") {
        return index + 1;
      }
    }

    return null;
  }

  return escapeIndex + 1 < data.length ? escapeIndex + 1 : null;
}

function alignTrimStartToEscapeBoundary(data: string, startIndex: number): number {
  if (startIndex <= 0 || startIndex >= data.length) {
    return startIndex;
  }

  let activeEscapeIndex: number | null = null;

  for (let index = 0; index < startIndex; index += 1) {
    const code = data.charCodeAt(index);

    if (activeEscapeIndex === null) {
      if (code === ASCII_ESCAPE_CODE) {
        activeEscapeIndex = index;
      }

      continue;
    }

    const sequenceEnd = findEscapeSequenceEnd(data, activeEscapeIndex);
    if (sequenceEnd === null) {
      return data.length;
    }

    if (index >= sequenceEnd) {
      activeEscapeIndex = null;
    }
  }

  if (activeEscapeIndex === null) {
    return startIndex;
  }

  const sequenceEnd = findEscapeSequenceEnd(data, activeEscapeIndex);
  if (sequenceEnd === null) {
    return data.length;
  }

  return sequenceEnd >= startIndex ? sequenceEnd + 1 : startIndex;
}

function stripTerminalEscapeSequences(data: string): string {
  let output = "";

  for (let index = 0; index < data.length; index += 1) {
    const character = data[index];
    if (character?.charCodeAt(0) !== ASCII_ESCAPE_CODE) {
      output += character ?? "";
      continue;
    }

    const next = data[index + 1];
    if (next === "[") {
      index += 1;
      while (index + 1 < data.length) {
        index += 1;
        const code = data.charCodeAt(index);
        if (code >= 0x40 && code <= 0x7e) {
          break;
        }
      }
      continue;
    }

    if (next === "]") {
      index += 1;
      while (index + 1 < data.length) {
        index += 1;
        const code = data.charCodeAt(index);
        if (code === ASCII_BELL_CODE) {
          break;
        }

        if (code === ASCII_ESCAPE_CODE && data[index + 1] === "\\") {
          index += 1;
          break;
        }
      }
    }
  }

  return output;
}

export function sanitizeTerminalDisplayOutput(data: string): string {
  let output = "";

  for (const character of stripTerminalEscapeSequences(data)) {
    const code = character.charCodeAt(0);

    if (character === "\r") {
      output += "\n";
      continue;
    }

    if (character === "\n" || character === "\t") {
      output += character;
      continue;
    }

    if (character === "\b" || code === 0x7f) {
      output = output.slice(0, -1);
      continue;
    }

    if (code >= 0x20) {
      output += character;
    }
  }

  return output.replace(/\[\?(?:1|12|25|1004|2004)[hl]/g, "").replace(/\n{3,}/g, "\n\n");
}

export function trimTerminalOutputForCache(data: string, maxLength: number): string {
  if (data.length <= maxLength) {
    return data;
  }

  const startIndex = alignTrimStartToEscapeBoundary(data, Math.max(0, data.length - maxLength));
  return data.slice(startIndex);
}

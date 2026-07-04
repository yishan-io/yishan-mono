/** Execution mode supported by direct agent invocation parsing. */
export type ParsedAgentInvocationMode = "foreground" | "background";

/** Parsed leading `@agent:` invocation. */
export interface ParsedAgentInvocation {
  agents: string[];
  prompt: string;
  mode: ParsedAgentInvocationMode;
}

/** Successful or failed parse result for a direct `@agent:` invocation. */
export type ParseAgentInvocationResult =
  | { kind: "invocation"; invocation: ParsedAgentInvocation }
  | { kind: "error"; message: string }
  | null;

const AGENT_TOKEN_PREFIX = "@agent:";
/**
 * Parses one leading direct `@agent:` invocation without touching later text.
 */
export function parseAgentInvocation(text: string, knownAgentNames: string[]): ParseAgentInvocationResult {
  const trimmedText = text.trimStart();
  if (!trimmedText.startsWith(AGENT_TOKEN_PREFIX)) {
    return null;
  }

  const knownAgentNamesByLowercase = new Map(knownAgentNames.map((name) => [name.toLowerCase(), name]));
  const selectedAgentNames: string[] = [];
  let currentIndex = 0;

  while (true) {
    while (currentIndex < trimmedText.length) {
      const currentCharacter = trimmedText.slice(currentIndex, currentIndex + 1);
      if (!/\s/.test(currentCharacter)) {
        break;
      }

      currentIndex += 1;
    }

    if (!trimmedText.slice(currentIndex).startsWith(AGENT_TOKEN_PREFIX)) {
      break;
    }

    const tokenEndIndex = findTokenEndIndex(trimmedText, currentIndex);
    const token = trimmedText.slice(currentIndex, tokenEndIndex);
    const requestedAgentName = token.slice(AGENT_TOKEN_PREFIX.length);
    const resolvedAgentName = knownAgentNamesByLowercase.get(requestedAgentName.toLowerCase());
    if (!resolvedAgentName) {
      return { kind: "error", message: `Unknown agent: ${requestedAgentName}` };
    }

    selectedAgentNames.push(resolvedAgentName);
    currentIndex = tokenEndIndex;
  }

  if (selectedAgentNames.length === 0) {
    return null;
  }

  const remainingText = trimmedText.slice(currentIndex).trim();
  if (remainingText.length === 0) {
    return { kind: "error", message: "Direct @agent invocation requires a non-empty task" };
  }

  return {
    kind: "invocation",
    invocation: {
      agents: selectedAgentNames,
      prompt: remainingText,
      mode: "foreground",
    },
  };
}

function findTokenEndIndex(text: string, startIndex: number): number {
  let currentIndex = startIndex;
  while (currentIndex < text.length) {
    const currentCharacter = text.slice(currentIndex, currentIndex + 1);
    if (/\s/.test(currentCharacter)) {
      break;
    }

    currentIndex += 1;
  }

  return currentIndex;
}

import { getSingularPatch, parseDiffFromFile } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import type { AgentContentBlock, AgentMessage } from "../../../chat/agentChatTypes";

/** Simple line-change counts derived from a unified diff patch. */
export type DiffStats = {
  added: number;
  removed: number;
};

/** Compact read-tool summary fields rendered in the card header. */
export type ReadSummary = {
  pathLabel: string;
  lineRange: string | null;
};

/** Extracts plain text content from a merged tool result message. */
export function extractResultText(message: AgentMessage | null | undefined): string {
  if (!message) {
    return "";
  }
  const { content } = message;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter(isTextContentBlock)
    .map((block) => block.text)
    .join("\n");
}

function isTextContentBlock(block: unknown): block is Extract<AgentContentBlock, { type: "text" }> {
  return (
    typeof block === "object" &&
    block !== null &&
    !Array.isArray(block) &&
    "type" in block &&
    "text" in block &&
    block.type === "text" &&
    typeof block.text === "string"
  );
}

/** Returns the final path segment for compact labels. */
export function getPathBaseName(filePath: string): string {
  const normalizedPath = filePath.trim().replace(/[\\/]+$/, "");
  if (normalizedPath.length === 0) {
    return filePath;
  }

  const pathSegments = normalizedPath.split(/[\\/]/);
  return pathSegments[pathSegments.length - 1] ?? filePath;
}

/** Counts added and removed lines in a unified patch. */
export function getDiffStats(patch: string): DiffStats | null {
  let added = 0;
  let removed = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      added++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      removed++;
    }
  }
  if (added === 0 && removed === 0) {
    return null;
  }
  return { added, removed };
}

/** Parses a tool patch into the diff viewer metadata shape when possible. */
export function parseToolDiff(patch: string): FileDiffMetadata | null {
  if (!patch) {
    return null;
  }

  try {
    return getSingularPatch(patch);
  } catch {
    return null;
  }
}

/** Returns the workspace-relative form of rawPath when it is an absolute path under workspacePath. */
export function getToolDisplayPath(rawPath: string, workspacePath?: string): string {
  if (!workspacePath) return rawPath;
  if (!rawPath.startsWith("/")) return rawPath;

  // Strip trailing slashes for comparison. Handle both rawPath and workspacePath forms.
  const rawPathClean = rawPath.endsWith("/") ? rawPath.slice(0, -1) : rawPath;
  const workspaceClean = workspacePath.endsWith("/") ? workspacePath.slice(0, -1) : workspacePath;

  if (rawPathClean === workspaceClean) return ".";
  if (rawPathClean.startsWith(`${workspaceClean}/`)) return rawPathClean.slice(workspaceClean.length + 1);

  return rawPath;
}

/** Builds a compact read summary from read-tool arguments. */
export function buildReadSummary(path: string, offset: unknown, limit: unknown, workspacePath?: string): ReadSummary {
  const startLine = parsePositiveLineNumber(offset) ?? 1;
  const lineLimit = parsePositiveLineNumber(limit);
  const displayPath = getToolDisplayPath(path, workspacePath);

  if (!lineLimit) {
    return {
      pathLabel: displayPath,
      lineRange: null,
    };
  }

  return {
    pathLabel: `${displayPath}:`,
    lineRange: `${startLine}-${startLine + lineLimit - 1}`,
  };
}

/** Builds a synthetic added-file diff for write tool calls without patch metadata. */
export function buildWriteToolNewFileDiff(filePath: string, content: string): FileDiffMetadata | null {
  try {
    return parseDiffFromFile({ name: filePath, contents: "" }, { name: filePath, contents: content });
  } catch {
    return null;
  }
}

function parsePositiveLineNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }

  return value;
}

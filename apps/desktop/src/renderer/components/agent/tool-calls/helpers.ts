import { getSingularPatch, parseDiffFromFile } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import { resolveRelativePath } from "@renderer/components/markdown/markdownHelpers";
import { openTab } from "../../../commands/tabCommands";
import type { AgentContentBlock, AgentMessage } from "../../../store/agentChatTypes";

/** Shared props for one rendered agent tool-call card. */
export type AgentToolCallCardProps = {
  toolCall: Extract<AgentContentBlock, { type: "toolCall" }>;
  result?: AgentMessage | null;
  workspacePath?: string;
};

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

/** Parsed grep output row that can optionally open a file location. */
export type GrepMatchLine = {
  filePath: string;
  lineNumber: number;
  preview: string;
};

/** Extracts plain text content from a merged tool result message. */
export function extractResultText(message: AgentMessage | null | undefined): string {
  if (!message) {
    return "";
  }
  if (typeof message.content === "string") {
    return message.content;
  }
  return message.content
    .filter((block): block is Extract<AgentContentBlock, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n");
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

/** Builds a compact read summary from read-tool arguments. */
export function buildReadSummary(path: string, offset: unknown, limit: unknown): ReadSummary {
  const startLine = parsePositiveLineNumber(offset) ?? 1;
  const lineLimit = parsePositiveLineNumber(limit);

  if (!lineLimit) {
    return {
      pathLabel: path,
      lineRange: null,
    };
  }

  return {
    pathLabel: `${path}:`,
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

/** Parses grep output into clickable file-match rows. */
export function parseGrepMatchLines(resultText: string, grepPath: string | null): GrepMatchLine[] {
  return resultText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const match = /^(?<filePath>[^:]+):(?<lineNumber>\d+):\s?(?<preview>.*)$/.exec(line);
      if (!match?.groups) {
        return [];
      }

      const rawLineNumber = match.groups.lineNumber;
      if (!rawLineNumber) {
        return [];
      }

      const parsedLineNumber = Number.parseInt(rawLineNumber, 10);
      if (!Number.isFinite(parsedLineNumber) || parsedLineNumber < 1) {
        return [];
      }

      const rawFilePath = match.groups.filePath?.trim() ?? "";
      const filePath = resolveGrepFilePath(rawFilePath, grepPath);
      if (!filePath) {
        return [];
      }

      return [
        {
          filePath,
          lineNumber: parsedLineNumber,
          preview: match.groups.preview?.trim() ?? "",
        },
      ];
    });
}

/** Opens one grep match in the workspace file tab system. */
export function openGrepFileMatch(filePath: string, workspacePath: string): void {
  openTab({ kind: "file", path: resolveRelativePath(workspacePath, filePath) });
}

/** Returns the badge color used for Agent tool statuses. */
export function getAgentStatusBadgeColor(status: string | null): string {
  switch (status) {
    case "completed":
      return "success.main";
    case "failed":
    case "error":
      return "error.main";
    case "cancelled":
    case "canceled":
      return "warning.main";
    default:
      return "info.main";
  }
}

function parsePositiveLineNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return null;
  }

  return value;
}

function resolveGrepFilePath(rawFilePath: string, grepPath: string | null): string | null {
  if (rawFilePath.length === 0) {
    return null;
  }

  if (rawFilePath.includes("/") || rawFilePath.includes("\\")) {
    return rawFilePath;
  }

  if (grepPath && getPathBaseName(grepPath) === rawFilePath) {
    return grepPath;
  }

  return null;
}

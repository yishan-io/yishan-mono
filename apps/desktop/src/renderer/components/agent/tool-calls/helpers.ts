import { getSingularPatch, parseDiffFromFile } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import { resolveRelativePath, toWorkspaceRelativePath } from "@renderer/components/markdown/markdownHelpers";
import { openTab } from "../../../commands/tabCommands";
import type { AgentContentBlock, AgentMessage } from "../../../features/agent/model/agentChatTypes";

/** Shared props for one rendered agent tool-call card. */
export type CompletedSubagentOpenTarget = {
  agentId?: string;
  childSessionId: string;
  title: string;
};

export type AgentToolCallCardProps = {
  toolCall: Extract<AgentContentBlock, { type: "toolCall" }>;
  result?: AgentMessage | null;
  workspacePath?: string;
  onOpenCompletedSubagent?: (target: CompletedSubagentOpenTarget) => void | Promise<void>;
};

/** One tool call paired with its merged result, grouped at turn level. */
export type GroupedToolCall = {
  toolCall: Extract<AgentContentBlock, { type: "toolCall" }>;
  result?: AgentMessage | null;
};

/** One summary line of a tool-call group, formatted via i18n in the UI. */
export type ToolCallSummaryItem = {
  key: "read" | "bash" | "edited" | "searched" | "used";
  count: number;
  toolName?: string;
};

/** Builds the Codex-style group summary counts, e.g. [{ key: "read", count: 2 }, { key: "bash", count: 1 }]. */
export function summarizeToolCalls(calls: GroupedToolCall[]): ToolCallSummaryItem[] {
  const counts = new Map<string, ToolCallSummaryItem>();

  for (const call of calls) {
    const categoryKey = getToolCallCategoryKey(call.toolCall.name);
    const existing = counts.get(categoryKey);
    if (existing) {
      existing.count += 1;
    } else {
      const { key, toolName } = parseToolCallCategoryKey(categoryKey);
      counts.set(categoryKey, { key, count: 1, ...(toolName !== undefined ? { toolName } : {}) });
    }
  }

  return [...counts.values()];
}

function getToolCallCategoryKey(name: string): string {
  switch (name) {
    case "read":
      return "read";
    case "bash":
      return "bash";
    case "edit":
    case "write":
      return "edited";
    case "grep":
      return "searched";
    default:
      return `used:${name}`;
  }
}

function parseToolCallCategoryKey(categoryKey: string): { key: ToolCallSummaryItem["key"]; toolName?: string } {
  if (categoryKey.startsWith("used:")) {
    return { key: "used", toolName: categoryKey.slice("used:".length) };
  }
  return { key: categoryKey as ToolCallSummaryItem["key"] };
}

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

/** Parsed memory search result row rendered in the expanded memory tool card. */
export type MemorySearchMatch = {
  path: string;
  snippet: string;
  score: number;
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

/** Opens one grep match in the workspace file tab system. */
export function openGrepFileMatch(filePath: string, workspacePath: string): void {
  const resolvedPath = resolveRelativePath(workspacePath, filePath);
  openTab({ kind: "file", path: toWorkspaceRelativePath(resolvedPath, workspacePath) });
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

/** Parses the workspace count from a workspace_list tool result. */
export function parseWorkspaceListCount(resultText: string): number | null {
  if (!resultText.trim()) {
    return null;
  }

  if (resultText.trim().startsWith("No workspaces")) {
    return 0;
  }

  try {
    const parsed = JSON.parse(resultText);
    if (Array.isArray(parsed)) {
      return parsed.length;
    }
  } catch {
    // not parseable JSON
  }

  return null;
}

/** LSP diagnostics totals parsed from the tool result header lines. */
export type LspDiagnosticsSummary = {
  servers: string[];
  totalDiagnostics: number;
  totalFiles: number;
};

/**
 * Parses per-server diagnostic totals from lsp_diagnostics result text.
 * Each section header looks like "<server> LSP diagnostics: N diagnostic(s)
 * across M file(s).". Returns null when no header line is found.
 */
export function parseLspDiagnosticsSummary(resultText: string): LspDiagnosticsSummary | null {
  const servers: string[] = [];
  let totalDiagnostics = 0;
  let totalFiles = 0;
  let found = false;

  for (const line of resultText.split("\n")) {
    const match =
      /^(?<server>.+?) LSP diagnostics: (?<diagnostics>\d+) diagnostic\(s\) across (?<files>\d+) file\(s\)\.$/.exec(
        line.trim(),
      );
    if (!match?.groups) {
      continue;
    }
    const server = match.groups.server ?? "";
    const diagnostics = Number.parseInt(match.groups.diagnostics ?? "0", 10);
    const files = Number.parseInt(match.groups.files ?? "0", 10);
    if (!server || !Number.isFinite(diagnostics) || !Number.isFinite(files)) {
      continue;
    }
    servers.push(server);
    totalDiagnostics += diagnostics;
    totalFiles += files;
    found = true;
  }

  return found ? { servers, totalDiagnostics, totalFiles } : null;
}

/** LSP fix outcome parsed from the tool result first line. */
export type LspFixSummary = {
  server: string;
  status: "updated" | "computed" | "unchanged";
  path: string;
};

/**
 * Parses the lsp_fix outcome from result text shaped like
 * "<server> LSP fix updated src/a.ts." (or "computed changes for"/
 * "left unchanged"). Returns null when no match is found.
 */
export function parseLspFixSummary(resultText: string): LspFixSummary | null {
  const firstLine = resultText.split("\n").find((line) => line.trim().length > 0);
  if (!firstLine) {
    return null;
  }

  const match = /^(.+?) LSP fix (updated|computed changes for|left unchanged) (.+)\.$/.exec(firstLine.trim());
  const server = match?.[1];
  const action = match?.[2];
  const path = match?.[3];
  if (!server || !action || !path) {
    return null;
  }

  const status: LspFixSummary["status"] =
    action === "updated" ? "updated" : action === "computed changes for" ? "computed" : "unchanged";
  return { server, status, path };
}

/** Returns the badge color used for lsp_fix outcomes. */
export function getLspFixStatusColor(status: LspFixSummary["status"]): string {
  switch (status) {
    case "updated":
      return "success.main";
    case "computed":
      return "info.main";
    case "unchanged":
      return "text.secondary";
  }
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

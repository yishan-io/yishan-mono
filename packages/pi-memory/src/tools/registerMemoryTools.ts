import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { MemoryBackendClient } from "../backend/types";

const memorySearchSchema = Type.Object({
  query: Type.String({ description: "1-3 keywords to search in durable memory" }),
  projectId: Type.Optional(
    Type.String({
      description: "Limit search to a specific project id. Defaults to YISHAN_PROJECT_ID when available.",
    }),
  ),
  scope: Type.Optional(
    Type.Union([Type.Literal("project"), Type.Literal("global")], {
      description: "Search scope. Defaults to the current project when project context is available.",
    }),
  ),
  limit: Type.Optional(Type.Number({ description: "Maximum number of results" })),
});

const memoryReadSchema = Type.Object({
  projectRoot: Type.String({ description: "Project root containing .my-context/" }),
  path: Type.String({ description: "Relative memory file path under .my-context/" }),
});

const memoryStoreSchema = Type.Object({
  projectRoot: Type.String({ description: "Project root containing .my-context/" }),
  section: Type.Union(
    [Type.Literal("locked_decisions"), Type.Literal("durable_discoveries"), Type.Literal("open_questions")],
    { description: "MEMORY.md section to update" },
  ),
  entry: Type.String({ description: "Memory entry text" }),
  date: Type.String({ description: "Entry date in YYYY-MM-DD format" }),
});

const memoryReconcileSchema = Type.Object({});

/**
 * Registers Pi memory tools backed by Yishan CLI memory services and .my-context files.
 */
export function registerMemoryTools(pi: ExtensionAPI, client: MemoryBackendClient): void {
  pi.registerTool({
    name: "memory_search",
    label: "Memory Search",
    description: "Search durable Yishan project memory through the indexed CLI backend.",
    promptSnippet:
      "Use memory_search to look up durable project context before reopening prior decisions or rediscovering known facts.",
    promptGuidelines: [
      "Use memory_search before making structural changes, reopening prior decisions, or asking the user to restate project history that may already exist in durable memory.",
    ],
    parameters: memorySearchSchema,
    async execute(_toolCallId, params) {
      const results = await client.search({
        query: params.query,
        projectId: params.projectId,
        scope: params.scope,
        limit: params.limit,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        details: { count: results.length },
      };
    },
  });

  pi.registerTool({
    name: "memory_read",
    label: "Memory Read",
    description: "Read one durable memory file from .my-context/.",
    promptSnippet: "Use memory_read to inspect the full contents of a durable memory file under .my-context/.",
    promptGuidelines: ["Use memory_read only for files under .my-context/."],
    parameters: memoryReadSchema,
    async execute(_toolCallId, params) {
      const memoryPath = resolveMemoryPath(params.projectRoot, params.path);
      const content = readFileSync(memoryPath, "utf8");
      return {
        content: [{ type: "text", text: content }],
        details: { path: memoryPath },
      };
    },
  });

  pi.registerTool({
    name: "memory_store",
    label: "Memory Store",
    description: "Store one durable memory entry into .my-context/MEMORY.md using the standard section layout.",
    promptSnippet:
      "Use memory_store when you need to record one high-value durable decision, discovery, or open question into project memory.",
    promptGuidelines: [
      "Use memory_store only for durable project memory, not task chatter or temporary implementation notes.",
    ],
    parameters: memoryStoreSchema,
    async execute(_toolCallId, params) {
      const memoryPath = resolveMemoryPath(params.projectRoot, "MEMORY.md");
      const previousContent = readMemoryFile(memoryPath);
      const nextContent = updateMemoryMarkdown(previousContent, params.section, params.entry, params.date);
      mkdirSync(dirname(memoryPath), { recursive: true });
      writeFileSync(memoryPath, nextContent, "utf8");
      return {
        content: [{ type: "text", text: `Stored memory entry in ${memoryPath}` }],
        details: { path: memoryPath, section: params.section },
      };
    },
  });

  pi.registerTool({
    name: "memory_reconcile",
    label: "Memory Reconcile",
    description: "Rebuild or repair the Yishan memory index from disk through the CLI backend.",
    parameters: memoryReconcileSchema,
    async execute() {
      const result = await client.reconcile();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });
}

function resolveMemoryPath(projectRoot: string, memoryRelativePath: string): string {
  if (isAbsolute(memoryRelativePath)) {
    throw new Error("Memory path must be relative to .my-context/");
  }

  const memoryRoot = resolve(projectRoot, ".my-context");
  const memoryPath = resolve(memoryRoot, memoryRelativePath);
  const resolvedRelativePath = relative(memoryRoot, memoryPath);
  if (resolvedRelativePath.startsWith("..") || isAbsolute(resolvedRelativePath)) {
    throw new Error("Memory path must stay within .my-context/");
  }

  return memoryPath;
}

function readMemoryFile(memoryPath: string): string {
  try {
    return readFileSync(memoryPath, "utf8");
  } catch {
    return buildEmptyMemoryMarkdown();
  }
}

function buildEmptyMemoryMarkdown(): string {
  return [
    "# Project Memory",
    "",
    `_Last updated: ${new Date().toISOString().slice(0, 10)}_`,
    "",
    "## Locked Decisions",
    "",
    "## Durable Discoveries",
    "",
    "## Open Questions",
    "",
  ].join("\n");
}

function updateMemoryMarkdown(content: string, section: string, entry: string, date: string): string {
  const lines = normalizeMemoryMarkdown(content, date).split("\n");
  const heading = getSectionHeading(section);
  const headingIndex = lines.findIndex((line) => line.trim() === heading);
  if (headingIndex === -1) {
    throw new Error(`Missing section heading: ${heading}`);
  }

  const formattedEntry = formatEntry(section, entry, date);
  const nextHeadingIndex = findNextHeadingIndex(lines, headingIndex + 1);
  const hasExistingEntry = lines
    .slice(headingIndex + 1, nextHeadingIndex)
    .some((line) => line.trim() === formattedEntry);
  if (!hasExistingEntry) {
    lines.splice(headingIndex + 1, 0, "", formattedEntry);
  }

  return `${lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd()}\n`;
}

function normalizeMemoryMarkdown(content: string, date: string): string {
  const trimmed = content.trim();
  if (trimmed.length === 0) {
    return buildEmptyMemoryMarkdown();
  }

  const lines = trimmed.split("\n");
  const timestampIndex = lines.findIndex((line) => line.startsWith("_Last updated: "));
  const nextTimestampLine = `_Last updated: ${date}_`;
  if (timestampIndex >= 0) {
    lines[timestampIndex] = nextTimestampLine;
  } else {
    lines.splice(1, 0, "", nextTimestampLine, "");
  }

  for (const heading of ["## Locked Decisions", "## Durable Discoveries", "## Open Questions"]) {
    if (!lines.includes(heading)) {
      lines.push("", heading, "");
    }
  }

  return lines.join("\n");
}

function getSectionHeading(section: string): string {
  switch (section) {
    case "locked_decisions":
      return "## Locked Decisions";
    case "durable_discoveries":
      return "## Durable Discoveries";
    case "open_questions":
      return "## Open Questions";
    default:
      throw new Error(`Unknown memory section: ${section}`);
  }
}

function formatEntry(section: string, entry: string, date: string): string {
  switch (section) {
    case "locked_decisions":
      return `- ${date} - ${entry}`;
    case "durable_discoveries":
    case "open_questions":
      return `- ${entry}`;
    default:
      throw new Error(`Unknown memory section: ${section}`);
  }
}

function findNextHeadingIndex(lines: string[], startIndex: number): number {
  const nextHeadingIndex = lines.findIndex((line, index) => index >= startIndex && line.startsWith("## "));
  return nextHeadingIndex === -1 ? lines.length : nextHeadingIndex;
}

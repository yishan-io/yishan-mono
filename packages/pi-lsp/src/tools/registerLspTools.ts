import { statSync } from "node:fs";
/**
 * Registers the lsp_diagnostics and lsp_fix tools on the Pi API.
 */
import path from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { loadRuntime } from "../config/config";
import { resolveRoot } from "../helpers/files";
import { textResult } from "./result";
import { DEFAULT_FILE_LIMIT, runDiagnostics } from "./runDiagnostics";
import { runFix } from "./runFix";
import { type DiagnosticRoute, selectDiagnosticRoutes, selectFixServer } from "./selectServers";

/**
 * Statusline key used while LSP tools are running.
 */
export const STATUS_KEY = "lsp";

const serverParameter = Type.Optional(
  Type.Union([Type.String(), Type.Array(Type.String())], {
    description:
      "Optional configured LSP server name, or names for diagnostics. Defaults to all servers matching the file extension.",
  }),
);

const diagnosticsSchema = Type.Object({
  paths: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Files or directories to check. Defaults to the workspace root and routes by configured server extensions.",
    }),
  ),
  root: Type.Optional(Type.String({ description: "Workspace root for language servers. Defaults to cwd." })),
  limit: Type.Optional(Type.Number({ description: "Maximum files to open per selected server." })),
  server: serverParameter,
});

const fixSchema = Type.Object({
  path: Type.String({
    description: "File to process. The server is selected from configured file extensions.",
  }),
  root: Type.Optional(Type.String({ description: "Workspace root for language servers. Defaults to cwd." })),
  write: Type.Optional(Type.Boolean({ description: "Write changed text back to the file. Defaults to false." })),
  kind: Type.Optional(Type.String({ description: "Source action kind. Defaults to source.fixAll." })),
  server: Type.Optional(
    Type.String({
      description: "Optional configured LSP server name. Defaults to extension-based inference.",
    }),
  ),
});

/**
 * Registers the LSP tools and their prompt guidance on the Pi API.
 */
export function registerLspTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "lsp_diagnostics",
    label: "LSP: Diagnostics",
    description:
      "Run LSP diagnostics (lint/type errors) on files or directories via a configured server such as biome or gopls. Use after editing files for fast, file-scoped feedback before slower repo-wide checks.",
    promptSnippet: "Run LSP diagnostics on changed files via the configured server",
    promptGuidelines: [
      "Use lsp_diagnostics after editing a file to catch lint and type issues scoped to that file; it is faster than a full repo check and works where no repo check script exists.",
      "Pass the specific files you changed in paths rather than scanning the whole workspace when you know the scope.",
      "Use the server parameter only when the user asks for a specific configured LSP server or multiple servers match the same extension.",
      "If a configured server command is missing, report the configuration error and suggest installing it or updating the server's command in lsp.json.",
    ],
    parameters: diagnosticsSchema,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const requestedRoot = resolveRoot(params.root);
      const runtime = loadRuntime(ctx.cwd, { projectTrusted: ctx.isProjectTrusted() });
      const selected = selectDiagnosticRoutes(runtime.servers, { ...params, root: requestedRoot }, DEFAULT_FILE_LIMIT);

      const results = [];
      for (const route of selected.routes) {
        const result = await runDiagnostics(
          route.server,
          { root: selected.root, paths: params.paths, limit: params.limit, files: route.files },
          runtime.timeoutMs,
          signal,
          ctx,
          STATUS_KEY,
        );
        results.push({ route, result });
      }

      const sections = results.map(({ route, result }) => `${route.reason}\n\n${textFromResult(result)}`);
      if (reportSkippedServers(selected.skipped, results, params.paths, selected.root)) {
        sections.push(
          `Skipped unavailable default LSP server(s): ${selected.skipped
            .map((route) => route.server.name)
            .join(", ")}.`,
        );
      }
      return textResult(sections.join("\n\n---\n\n"), {
        root: selected.root,
        skipped: selected.skipped.map((route) => ({
          server: route.server.name,
          reason: route.reason,
          files: route.files,
        })),
        routes: results.map(({ route, result }) => ({
          server: route.server.name,
          reason: route.reason,
          files: route.files,
          details: result.details,
        })),
      });
    },
  });

  pi.registerTool({
    name: "lsp_fix",
    label: "LSP: Fix",
    description:
      "Apply LSP source fixes to a file, e.g. biome safe fixes or organize imports, and optionally write them back.",
    promptSnippet: "Apply configured LSP source fixes to a file",
    promptGuidelines: [
      "Use lsp_fix when lsp_diagnostics reports fixable diagnostics on a file, or when the file needs import organization.",
      "Pass write: true to persist the fix; without it the result is a preview of the edits.",
      "Use kind when the server needs a specific source action kind such as source.organizeImports.",
    ],
    parameters: fixSchema,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const requestedRoot = resolveRoot(params.root);
      const runtime = loadRuntime(ctx.cwd, { projectTrusted: ctx.isProjectTrusted() });
      const selected = selectFixServer(runtime.servers, { ...params, root: requestedRoot });
      return runFix(
        selected.server,
        { root: selected.root, path: params.path, kind: params.kind, write: params.write },
        runtime.timeoutMs,
        signal,
        ctx,
        STATUS_KEY,
      );
    },
  });
}

/**
 * Extracts the text content from a tool result.
 */
function textFromResult(result: { content?: Array<{ type?: string; text?: string }> }): string {
  return result.content?.find((item) => item.type === "text")?.text ?? "";
}

/**
 * Decides whether skipped default servers are worth reporting as text.
 *
 * When something ran, skipped servers are reported only when an explicitly
 * requested path is in scope for them: a directory entry is in scope for
 * every server (it would have been scanned), and a file entry only for
 * servers matching its extension. When nothing ran, the list explains why
 * and is reported when the request is in scope (or in full for a
 * workspace-wide scan). Servers the user never configured and whose
 * languages are not in scope stay quiet, so a workspace-wide scan does not
 * list every uninstalled catalog server.
 */
export function reportSkippedServers(
  skipped: DiagnosticRoute[],
  results: unknown[],
  paths: string[] | undefined,
  root: string,
): boolean {
  if (results.length === 0) {
    return paths?.length ? skippedRelevantToPaths(skipped, paths, root) : true;
  }
  if (!paths?.length) return false;
  return skippedRelevantToPaths(skipped, paths, root);
}

/**
 * Whether any skipped server is relevant to the explicitly requested paths.
 */
function skippedRelevantToPaths(skipped: DiagnosticRoute[], paths: string[], root: string): boolean {
  const entries = paths.filter((entry) => entry.length > 0);
  if (entries.length === 0) return false;
  return skipped.some((route) => entries.some((entry) => pathInScopeForServer(entry, root, route.server)));
}

/**
 * Whether one requested path is in scope for a server: directories always
 * (the server would scan them), files only when the extension matches. A
 * missing path falls back to its file extension, so a typo or not-yet-
 * created file still reports the right server.
 */
function pathInScopeForServer(entry: string, root: string, server: DiagnosticRoute["server"]): boolean {
  const resolved = path.resolve(root, entry);
  try {
    if (statSync(resolved).isDirectory()) return true;
  } catch {
    // Path does not exist yet; fall through to the extension check.
  }
  const extension = path.extname(entry).toLowerCase();
  return extension.length > 0 && server.extensions.some((ext) => ext.toLowerCase() === extension);
}

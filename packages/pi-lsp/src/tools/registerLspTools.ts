/**
 * Registers the lsp_diagnostics and lsp_fix tools on the Pi API.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { loadRuntime } from "../config/config";
import { resolveRoot } from "../helpers/files";
import { textResult } from "./result";
import { DEFAULT_FILE_LIMIT, runDiagnostics } from "./runDiagnostics";
import { runFix } from "./runFix";
import { selectDiagnosticRoutes, selectFixServer } from "./selectServers";

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
    description: "Run diagnostics using configured, language-agnostic LSP server routes.",
    promptSnippet: "Get diagnostics from configured LSP servers selected by file extension",
    promptGuidelines: [
      "Use lsp_diagnostics when files need diagnostics from a configured LSP server.",
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
      if (selected.skipped.length) {
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
    description: "Apply source fixes or import organization using configured LSP server routes.",
    promptSnippet: "Apply configured LSP source fixes to a file",
    promptGuidelines: [
      "Use lsp_fix for files handled by a configured LSP code-action server.",
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

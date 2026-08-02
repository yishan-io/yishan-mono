/**
 * Diagnostics orchestration for one tool call: spawn a server, open the
 * target files, collect diagnostics, format the result, then tear down.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { discoverSupportedFiles, resolveRoot } from "../helpers/files";
import { LspClient } from "../lsp/client";
import type { DiagnosticEntry, ResolvedServer, StatusReporter } from "../types";
import { formatDiagnostics, summarize, textResult } from "./result";

/**
 * Default cap on files opened per server in one diagnostics call.
 */
export const DEFAULT_FILE_LIMIT = 50;

/**
 * Runs diagnostics through one server binding.
 */
export async function runDiagnostics(
  server: ResolvedServer,
  params: { root?: string; paths?: string[]; limit?: number; files?: string[] },
  timeoutMs: number,
  signal: AbortSignal | undefined,
  ctx: StatusReporter,
  statusKey: string,
) {
  const root = resolveRoot(params.root);
  const files = params.files ?? discoverSupportedFiles(server, root, params.paths, params.limit ?? DEFAULT_FILE_LIMIT);
  if (files.length === 0) {
    return textResult(`${server.name} LSP found no supported files to check.`, {
      root,
      command: server.command,
      files: [],
      summary: { files: 0, diagnostics: 0 },
    });
  }

  const client = new LspClient(server, root, timeoutMs);
  const abort = () => client.close();
  throwIfAborted(signal, server);
  signal?.addEventListener("abort", abort, { once: true });

  try {
    ctx.ui.setStatus(statusKey, `${server.name} diagnostics`);
    throwIfAborted(signal, server);
    await client.start();
    await client.initialize(root);

    const opened: Array<{ file: string; uri: string }> = [];
    try {
      for (const file of files) {
        throwIfAborted(signal, server);
        const uri = pathToFileURL(file).href;
        client.didOpen(uri, readFileSync(file, "utf8"), server.languageIdFor(file));
        opened.push({ file, uri });
      }

      const entries: DiagnosticEntry[] = await Promise.all(
        opened.map(async ({ file, uri }) => ({
          path: path.relative(root, file) || file,
          uri,
          diagnostics: await client.diagnostics(uri),
        })),
      );
      return textResult(formatDiagnostics(server, entries), {
        root,
        command: server.command,
        files: entries,
        summary: summarize(entries),
      });
    } finally {
      for (const { uri } of opened) client.didClose(uri);
    }
  } finally {
    ctx.ui.setStatus(statusKey, undefined);
    signal?.removeEventListener("abort", abort);
    await client.shutdown();
  }
}

/**
 * Throws when the abort signal is already aborted.
 */
function throwIfAborted(signal: AbortSignal | undefined, server: ResolvedServer): void {
  if (signal?.aborted) throw new Error(`${server.name} LSP request aborted.`);
}

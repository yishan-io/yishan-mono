/**
 * Source-fix orchestration for one tool call: spawn a server, open the file,
 * request code actions, apply the workspace edits, and optionally write the
 * result back.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveRoot, resolveSingleFile } from "../helpers/files";
import { applyEdits, collectEditsForUri, hasConflictingEdits } from "../helpers/textEdits";
import { LspClient } from "../lsp/client";
import type { CodeAction, LspTextEdit, ResolvedServer, StatusReporter } from "../types";
import { formatEditSummary, textResult } from "./result";

/**
 * Runs a source fix through one server binding for a single file.
 */
export async function runFix(
  server: ResolvedServer,
  params: { root?: string; path: string; kind?: string; write?: boolean },
  timeoutMs: number,
  signal: AbortSignal | undefined,
  ctx: StatusReporter,
  statusKey: string,
) {
  const root = resolveRoot(params.root);
  const file = resolveSingleFile(server, root, params.path);
  const actionKind = params.kind?.trim() || "source.fixAll";

  const client = new LspClient(server, root, timeoutMs);
  const abort = () => client.close();
  throwIfAborted(signal, server);
  signal?.addEventListener("abort", abort, { once: true });

  try {
    ctx.ui.setStatus(statusKey, `${server.name} fix`);
    throwIfAborted(signal, server);
    await client.start();
    await client.initialize(root);
    throwIfAborted(signal, server);

    const uri = pathToFileURL(file).href;
    const text = readFileSync(file, "utf8");
    client.didOpen(uri, text, server.languageIdFor(file));
    let resolvedActions: CodeAction[];
    let appliedActions: CodeAction[];
    let edits: LspTextEdit[];
    let newText: string;
    try {
      const diagnostics = await client.diagnostics(uri);
      const actions = await client.codeActions(uri, text, diagnostics, actionKind);
      resolvedActions = await client.resolveActions(actions);
      appliedActions = matchActionKind(resolvedActions, actionKind);
      edits = appliedActions.flatMap((action) => collectEditsForUri(action.edit, uri));
      if (hasConflictingEdits(text, edits)) {
        const relativePath = path.relative(root, file) || file;
        throw new Error(
          `${server.name} LSP returned overlapping code-action edits for ${relativePath}; use a narrower action kind.`,
        );
      }
      newText = applyEdits(text, edits);
    } finally {
      client.didClose(uri);
    }
    const changed = newText !== text;
    if (params.write && changed) writeFileSync(file, newText);

    return textResult(formatEditSummary(server.name, root, file, changed, params.write, newText), {
      path: path.relative(root, file) || file,
      uri,
      changed,
      write: params.write ?? false,
      kind: actionKind,
      actions: resolvedActions.map(({ title, kind }) => ({ title, kind })),
      appliedActions: appliedActions.map(({ title, kind }) => ({ title, kind })),
      edits,
      text: params.write ? undefined : newText,
    });
  } finally {
    ctx.ui.setStatus(statusKey, undefined);
    signal?.removeEventListener("abort", abort);
    await client.shutdown();
  }
}

/**
 * Keeps only actions whose kind matches the requested kind exactly or as a
 * dotted prefix.
 */
function matchActionKind(actions: CodeAction[], requestedKind: string): CodeAction[] {
  return actions.filter((action) => action.kind === requestedKind || action.kind?.startsWith(`${requestedKind}.`));
}

/**
 * Throws when the abort signal is already aborted.
 */
function throwIfAborted(signal: AbortSignal | undefined, server: ResolvedServer): void {
  if (signal?.aborted) throw new Error(`${server.name} LSP request aborted.`);
}

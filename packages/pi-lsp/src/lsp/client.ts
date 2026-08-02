/**
 * LSP client protocol layer: initialize handshake, document synchronization,
 * pull/push diagnostics, and code-action resolution over an LspTransport.
 * One LspClient drives one short-lived server process per tool call.
 */
import path from "node:path";
import process from "node:process";

import { directoryUri } from "../helpers/files";
import { offsetToPosition } from "../helpers/textEdits";
import type { CodeAction, LspDiagnostic, LspTextEdit, ResolvedServer, ServerCommand } from "../types";
import { DEFAULT_SETTLE_MS, PushDiagnosticsTracker } from "./diagnostics";
import { LspTransport } from "./transport";

/**
 * Drives one language server process for a single tool call.
 */
export class LspClient {
  #transport: LspTransport;
  #tracker = new PushDiagnosticsTracker();
  #server: ResolvedServer;
  #capabilities: Record<string, unknown> = {};

  constructor(server: ResolvedServer, cwd: string, timeoutMs: number) {
    this.#server = server;
    const command: ServerCommand = server.command;
    this.#transport = new LspTransport(server.name, command, cwd, server.env, timeoutMs);
    this.#transport.onMessage = (message) => this.#handleServerMessage(message);
    this.#transport.onClosed = () => this.#tracker.rejectAll(`${server.name} LSP request cancelled.`);
  }

  /**
   * Spawns the server child process.
   */
  async start(): Promise<void> {
    await this.#transport.start();
  }

  /**
   * Completes the initialize handshake with statically advertised client
   * capabilities and the configured initialization options.
   */
  async initialize(root: string): Promise<void> {
    const rootUri = directoryUri(root);
    const response = (await this.#transport.request("initialize", {
      processId: process.pid,
      rootUri,
      workspaceFolders: [{ uri: rootUri, name: path.basename(root) || "workspace" }],
      initializationOptions: this.#server.initialization ?? {},
      capabilities: {
        textDocument: {
          // This spawn-per-call client cannot track dynamic
          // registrations, so capabilities are static.
          codeAction: {
            dynamicRegistration: false,
            resolveSupport: { properties: ["edit"] },
          },
          diagnostic: { dynamicRegistration: false, relatedDocumentSupport: true },
          publishDiagnostics: {},
          synchronization: { didSave: true },
        },
        workspace: {
          configuration: true,
          workspaceEdit: { documentChanges: true },
          workspaceFolders: true,
        },
      },
    })) as { capabilities?: Record<string, unknown> };
    this.#capabilities = response.capabilities ?? {};
    this.#transport.notify("initialized");
    if (this.#server.initialization) {
      this.#transport.notify("workspace/didChangeConfiguration", {
        settings: this.#server.initialization,
      });
    }
  }

  /**
   * Opens a document in the server.
   */
  didOpen(uri: string, text: string, languageId: string): void {
    this.#transport.notify("textDocument/didOpen", {
      textDocument: { uri, languageId, version: 1, text },
    });
  }

  /**
   * Closes a document, returning whether a server was still running.
   */
  didClose(uri: string): boolean {
    if (!this.#transport.isRunning) return false;
    this.#transport.notify("textDocument/didClose", { textDocument: { uri } });
    return true;
  }

  /**
   * Returns diagnostics for an opened document: pull when the server
   * advertised diagnosticProvider, otherwise push with grace handling.
   */
  async diagnostics(uri: string): Promise<LspDiagnostic[]> {
    if (!this.#capabilities.diagnosticProvider) {
      return this.#tracker.waitForDiagnostics(uri, {
        settleMs: this.#server.diagnosticsSettleMs ?? DEFAULT_SETTLE_MS,
        graceMs: this.#server.pushDiagnosticsGraceMs,
        overallTimeoutMs: this.#transport.timeoutMs,
        serverName: this.#server.name,
      });
    }

    // A provisional empty publication must not erase real diagnostics that
    // arrived before the pull.
    const afterVersion = this.#tracker.hasDiagnostics(uri)
      ? this.#tracker.versionOf(uri) - 1
      : this.#tracker.versionOf(uri);
    const result = (await this.#transport.request("textDocument/diagnostic", {
      textDocument: { uri },
    })) as { items?: LspDiagnostic[] };
    const diagnostics = result.items ?? [];
    if (diagnostics.length > 0 || !this.#server.pullDiagnosticsGraceMs) return diagnostics;

    return this.#tracker.waitForDiagnostics(uri, {
      settleMs: this.#server.diagnosticsSettleMs ?? DEFAULT_SETTLE_MS,
      afterVersion,
      graceMs: this.#server.pullDiagnosticsGraceMs,
      fallbackDiagnostics: diagnostics,
      overallTimeoutMs: this.#transport.timeoutMs,
      serverName: this.#server.name,
    });
  }

  /**
   * Requests code actions covering the whole document for one kind.
   */
  async codeActions(uri: string, text: string, diagnostics: LspDiagnostic[], kind: string): Promise<CodeAction[]> {
    const result = (await this.#transport.request("textDocument/codeAction", {
      textDocument: { uri },
      range: { start: { line: 0, character: 0 }, end: offsetToPosition(text, text.length) },
      context: { diagnostics, only: [kind] },
    })) as CodeAction[] | null | undefined;
    return result ?? [];
  }

  /**
   * Resolves code actions when the server advertised resolveProvider;
   * otherwise returns the actions as-is.
   */
  async resolveActions(actions: CodeAction[]): Promise<CodeAction[]> {
    const provider = this.#capabilities.codeActionProvider;
    const canResolve =
      typeof provider === "object" &&
      provider !== null &&
      (provider as { resolveProvider?: boolean }).resolveProvider === true;

    const resolved: CodeAction[] = [];
    for (const action of actions) {
      if (action.edit || !canResolve) {
        resolved.push(action);
        continue;
      }
      const result = (await this.#transport.request("codeAction/resolve", action)) as CodeAction | undefined;
      resolved.push(result ?? action);
    }
    return resolved;
  }

  /**
   * Sends shutdown, exits the server, and closes the transport.
   */
  async shutdown(): Promise<void> {
    if (!this.#transport.isRunning) return;
    try {
      await this.#transport.request("shutdown", null);
      this.#transport.notify("exit");
    } catch {
      // The process may already be gone; close below still cleans up.
    } finally {
      this.close();
    }
  }

  /**
   * Rejects pending requests and diagnostics waiters, then terminates the
   * server process.
   */
  close(): void {
    this.#transport.close();
  }

  /**
   * Handles server-to-client messages: records push diagnostics and answers
   * server requests.
   */
  #handleServerMessage(message: {
    method?: string;
    id?: number | string | null;
    params?: unknown;
  }): void {
    if (message.method === "textDocument/publishDiagnostics") {
      const params = message.params as { uri?: string; diagnostics?: LspDiagnostic[] };
      if (params?.uri) {
        this.#tracker.registerPublication(params.uri, params.diagnostics ?? []);
      }
      return;
    }
    if (Object.hasOwn(message, "id") && message.method) {
      this.#answerServerRequest(message as { id: number | string | null; method: string; params?: unknown });
    }
  }

  /**
   * Answers server requests: configuration values, workspace folders,
   * capability registration, or method-not-found.
   */
  #answerServerRequest(message: { id: number | string | null; method: string; params?: unknown }): void {
    if (message.method === "workspace/configuration") {
      const params = message.params as { items?: Array<{ section?: string }> };
      const values = (params?.items ?? []).map((item) =>
        item.section ? (this.#server.initialization?.[item.section] ?? {}) : (this.#server.initialization ?? {}),
      );
      this.#transport.respond(message.id, values);
      return;
    }

    if (message.method === "workspace/workspaceFolders") {
      const rootUri = directoryUri(this.#transport.cwd);
      this.#transport.respond(message.id, [{ uri: rootUri, name: path.basename(this.#transport.cwd) || "workspace" }]);
      return;
    }

    if (message.method === "client/registerCapability" || message.method === "client/unregisterCapability") {
      this.#transport.respond(message.id, null);
      return;
    }

    this.#transport.respondError(message.id, -32601, `Method not found: ${message.method}`);
  }
}

export type { LspTextEdit };

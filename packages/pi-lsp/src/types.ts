/**
 * Domain types for the pi-lsp extension: LSP protocol payloads, JSON-RPC
 * message shapes, and the configured-server model used to route tool calls.
 */

/**
 * An executable and its arguments, used to start a language server.
 */
export interface ServerCommand {
  command: string;
  args: string[];
}

/**
 * A zero-based position inside an LSP document.
 */
export interface LspPosition {
  line: number;
  character: number;
}

/**
 * A zero-based range inside an LSP document.
 */
export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

/**
 * A diagnostic reported by a language server for one document.
 */
export interface LspDiagnostic {
  range: LspRange;
  severity?: number;
  code?: string | number;
  codeDescription?: { href?: string };
  source?: string;
  message: string;
}

/**
 * A single text replacement over a range.
 */
export interface LspTextEdit {
  range: LspRange;
  newText: string;
}

/**
 * An LSP workspace edit in either supported representation.
 */
export interface WorkspaceEdit {
  changes?: Record<string, LspTextEdit[]>;
  documentChanges?: Array<{
    textDocument?: { uri?: string; version?: number | null };
    edits?: LspTextEdit[];
  }>;
}

/**
 * A code action offered by a language server.
 */
export interface CodeAction {
  title: string;
  kind?: string;
  edit?: WorkspaceEdit;
  data?: unknown;
}

/**
 * Diagnostics collected for one opened document.
 */
export interface DiagnosticEntry {
  path: string;
  uri: string;
  diagnostics: LspDiagnostic[];
}

/**
 * A JSON-RPC 2.0 message exchanged with a language server.
 */
export interface JsonRpcMessage {
  jsonrpc?: "2.0";
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * One language server as declared in the pi-lsp configuration.
 */
export interface ConfiguredServer {
  command: string[];
  extensions: string[];
  env?: Record<string, string>;
  initialization?: Record<string, unknown>;
  skipDirectories?: string[];
  /**
   * Quiet period in milliseconds after the latest push-diagnostics
   * publication before the result is considered settled.
   */
  diagnosticsSettleMs?: number;
  /**
   * How long to wait for a first publication from a push-only server that
   * stays silent for a clean document.
   */
  pushDiagnosticsGraceMs?: number;
  /**
   * How long to wait for a newer push publication after an empty pull
   * diagnostics result.
   */
  pullDiagnosticsGraceMs?: number;
}

/**
 * A configured server with its name attached.
 */
export interface NamedServer extends ConfiguredServer {
  name: string;
  isDefault?: boolean;
}

/**
 * The normalized pi-lsp configuration.
 */
export interface LspConfig {
  timeout?: number;
  servers: NamedServer[];
}

/**
 * A ready-to-run server binding: command, file routing helpers, and the
 * diagnostics policy.
 */
export interface ResolvedServer {
  name: string;
  isDefault: boolean;
  command: ServerCommand;
  missingCommandHint: string;
  extensions: string[];
  env?: Record<string, string>;
  initialization?: Record<string, unknown>;
  skipDirectories: Set<string>;
  diagnosticsSettleMs?: number;
  pushDiagnosticsGraceMs?: number;
  pullDiagnosticsGraceMs?: number;
  /**
   * Returns whether the file extension routes to this server.
   */
  isSupportedFile: (filePath: string) => boolean;
  /**
   * Returns the LSP language id for a file path.
   */
  languageIdFor: (filePath: string) => string;
}

/**
 * Counts summarizing a diagnostics run.
 */
export interface DiagnosticSummary {
  files: number;
  diagnostics: number;
}

/**
 * The minimal UI surface tools need to report activity during a run.
 */
export interface StatusReporter {
  ui: { setStatus: (key: string, value: string | undefined) => void };
}

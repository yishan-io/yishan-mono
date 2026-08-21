import type { Writable } from "node:stream";

import { defaultCodeGraphLauncher, resolveProjectDirectory } from "./launch";
import { boundedDiagnostic, formatCodeGraphResult, normalizeCodeGraphFiles } from "./result";

const DEFAULT_SESSION_TIMEOUT_MS = 30_000;
const DEFAULT_CLOSE_GRACE_MS = 1_000;

/** A launched CodeGraph stdio process with cross-platform termination support. */
export interface LaunchedCodeGraph {
  /** Whether the process has already closed. */
  readonly isClosed: boolean;
  /** JSON-lines input stream. */
  readonly stdin: Writable;
  /** JSON-lines output stream. */
  readonly stdout: NodeJS.ReadableStream;
  /** Diagnostic output stream. */
  readonly stderr: NodeJS.ReadableStream;
  /** Subscribes to process lifecycle events. */
  on(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  /** Removes a process lifecycle listener. */
  off(event: "close", listener: (code: number | null, signal: NodeJS.Signals | null) => void): void;
  /** Requests graceful process or process-tree termination. */
  terminate(): Promise<void>;
  /** Forcefully terminates a process or process tree after the close grace period. */
  forceTerminate(): Promise<void>;
}

/** Injectable boundary used to launch one CodeGraph MCP server. */
export interface CodeGraphLauncher {
  /** Launches CodeGraph for the already validated project directory. */
  launch(projectPath: string): Promise<LaunchedCodeGraph>;
}

/** Configuration for a bounded CodeGraph MCP session. */
export interface CodeGraphMcpClientOptions {
  /** Injectable CodeGraph process launcher. */
  readonly launcher?: CodeGraphLauncher;
  /** Named whole-session deadline in milliseconds. */
  readonly timeoutMs?: number;
  /** Grace period before forceful termination. */
  readonly closeGraceMs?: number;
}

/** Input to a single short-lived CodeGraph MCP tool session. */
export interface CodeGraphCall {
  /** Frozen MCP tool name. */
  readonly toolName: string;
  /** Exact MCP tool arguments. */
  readonly arguments: Record<string, unknown>;
  /** Explicit project root, if supplied by the Pi tool. */
  readonly projectPath?: string;
  /** Pi execution cwd; used when projectPath is absent. */
  readonly cwd?: string;
  /** Pi tool cancellation signal. */
  readonly signal?: AbortSignal;
}

/** Executes one bounded CodeGraph MCP stdio session. */
export class CodeGraphMcpClient {
  readonly #launcher: CodeGraphLauncher;
  readonly #timeoutMs: number;
  readonly #closeGraceMs: number;

  constructor(options: CodeGraphMcpClientOptions = {}) {
    this.#launcher = options.launcher ?? defaultCodeGraphLauncher;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS;
    this.#closeGraceMs = options.closeGraceMs ?? DEFAULT_CLOSE_GRACE_MS;
  }

  /** Initializes CodeGraph, calls one tool, then always terminates the process. */
  async call(
    call: CodeGraphCall,
  ): Promise<{ text: string; details: ReturnType<typeof formatCodeGraphResult>["details"] }> {
    const timeout = createTimeout(this.#timeoutMs);
    let child: LaunchedCodeGraph | undefined;
    let session: JsonLineSession | undefined;
    try {
      throwIfAborted(call.signal);
      const projectPath = await awaitWithCancellation(
        resolveProjectDirectory(call.projectPath, call.cwd ?? "", timeout.signal),
        timeout.signal,
        call.signal,
      );
      const launch = this.#launcher.launch(projectPath);
      try {
        child = await awaitWithCancellation(launch, timeout.signal, call.signal);
      } catch (error) {
        launch.then((lateChild) => closeChild(lateChild, this.#closeGraceMs)).catch(() => undefined);
        throw error;
      }
      session = new JsonLineSession(child, timeout.signal, call.signal);
      await session.request("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "pi-codegraph", version: "0.1.0" },
      });
      session.notify("notifications/initialized");
      const response = await session.request("tools/call", { name: call.toolName, arguments: call.arguments });
      const text = extractTextResult(response);
      const normalizedText =
        call.toolName === "codegraph_files" ? normalizeCodeGraphFiles(text, projectPath, call.arguments) : text;
      return formatCodeGraphResult(normalizedText);
    } catch (error) {
      throw new Error(describeSessionError(error));
    } finally {
      timeout.dispose();
      session?.dispose();
      if (child) await closeChild(child, this.#closeGraceMs);
    }
  }
}

class JsonLineSession {
  #child: LaunchedCodeGraph;
  #lineBuffer = "";
  #stderr = "";
  #nextId = 1;
  #pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason: Error) => void }>();
  #closed = false;
  #timeoutSignal: AbortSignal;
  #callSignal: AbortSignal | undefined;
  #onAbort: () => void;
  #onStdout: (chunk: Buffer | string) => void;
  #onStderr: (chunk: Buffer | string) => void;
  #onClose: (code: number | null, signal: NodeJS.Signals | null) => void;
  #onStdinError: (error: Error) => void;

  constructor(child: LaunchedCodeGraph, timeoutSignal: AbortSignal, callSignal?: AbortSignal) {
    this.#child = child;
    this.#timeoutSignal = timeoutSignal;
    this.#callSignal = callSignal;
    this.#onAbort = () =>
      this.#fail(this.#timeoutSignal.aborted ? "CodeGraph MCP session timed out." : "CodeGraph MCP session aborted.");
    this.#onStdout = (chunk) => this.#consume(chunk.toString());
    this.#onStderr = (chunk) => {
      this.#stderr += chunk.toString();
    };
    this.#onClose = (code, signal) =>
      this.#fail(`CodeGraph MCP server exited (${signal ?? `code ${code ?? "unknown"}`}).`);
    this.#onStdinError = () => this.#fail("CodeGraph MCP server stdin failed.");
    child.stdout.on("data", this.#onStdout);
    child.stderr.on("data", this.#onStderr);
    child.stdin.on("error", this.#onStdinError);
    child.on("close", this.#onClose);
    this.#timeoutSignal.addEventListener("abort", this.#onAbort, { once: true });
    this.#callSignal?.addEventListener("abort", this.#onAbort, { once: true });
    if (this.#timeoutSignal.aborted || this.#callSignal?.aborted) this.#onAbort();
  }

  request(method: string, params: unknown): Promise<unknown> {
    if (this.#closed) return Promise.reject(new Error("CodeGraph MCP session is closed."));
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#send({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string): void {
    this.#send({ jsonrpc: "2.0", method });
  }

  dispose(): void {
    this.#closed = true;
    this.#child.stdout.off("data", this.#onStdout);
    this.#child.stderr.off("data", this.#onStderr);
    this.#child.stdin.off("error", this.#onStdinError);
    this.#child.off("close", this.#onClose);
    this.#timeoutSignal.removeEventListener("abort", this.#onAbort);
    this.#callSignal?.removeEventListener("abort", this.#onAbort);
  }

  #send(message: unknown): void {
    if (this.#closed) return;
    try {
      this.#child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
        if (error) this.#fail("CodeGraph MCP server stdin failed.");
      });
    } catch {
      this.#fail("CodeGraph MCP server stdin failed.");
    }
  }

  #consume(chunk: string): void {
    this.#lineBuffer += chunk;
    const lines = this.#lineBuffer.split("\n");
    this.#lineBuffer = lines.pop() ?? "";
    for (const line of lines) this.#handleLine(line);
  }

  #handleLine(line: string): void {
    if (!line.trim()) return;
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      this.#fail("CodeGraph MCP server sent invalid JSON.");
      return;
    }
    if (!isResponse(message)) return;
    const pending = this.#pending.get(message.id);
    if (!pending) return;
    this.#pending.delete(message.id);
    if (message.error)
      pending.reject(new Error(`MCP JSON-RPC error (${message.error.code}): ${message.error.message}`));
    else pending.resolve(message.result);
  }

  #fail(message: string): void {
    if (this.#closed) return;
    this.#closed = true;
    const diagnostic = this.#stderr ? ` ${boundedDiagnostic(this.#stderr)}` : "";
    for (const pending of this.#pending.values()) pending.reject(new Error(`${message}${diagnostic}`));
    this.#pending.clear();
  }
}

function extractTextResult(response: unknown): string {
  if (!isRecord(response)) throw new Error("MCP tool returned an invalid result.");
  const content = response.content;
  if (!Array.isArray(content)) throw new Error("MCP tool returned no text content.");
  if (content.some((block) => !isTextContent(block))) throw new Error("MCP tool returned unsupported content.");
  const text = content.map((block) => block.text).join("\n");
  if (response.isError === true) throw new Error(`MCP tool error: ${text || "no diagnostic text"}`);
  if (!text) throw new Error("MCP tool returned no text content.");
  return text;
}

function isTextContent(content: unknown): content is { type: "text"; text: string } {
  return isRecord(content) && content.type === "text" && typeof content.text === "string";
}

function isResponse(
  message: unknown,
): message is { id: number; result?: unknown; error?: { code: number; message: string } } {
  return isRecord(message) && typeof message.id === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createTimeout(timeoutMs: number): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, dispose: () => clearTimeout(timer) };
}

async function closeChild(child: LaunchedCodeGraph, graceMs: number): Promise<void> {
  if (child.isClosed) return;
  await runBounded(() => child.terminate(), graceMs);
  if (await waitForChildClose(child, graceMs)) return;
  await runBounded(() => child.forceTerminate(), graceMs);
  await waitForChildClose(child, graceMs);
}

function runBounded(operation: () => Promise<void>, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let hasSettled = false;
    const finish = () => {
      if (hasSettled) return;
      hasSettled = true;
      clearTimeout(timeout);
      resolve();
    };
    const timeout = setTimeout(finish, timeoutMs);
    Promise.resolve().then(operation).then(finish, finish);
  });
}

function waitForChildClose(child: LaunchedCodeGraph, timeoutMs: number): Promise<boolean> {
  if (child.isClosed) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off("close", handleClose);
      resolve(false);
    }, timeoutMs);
    const handleClose = () => {
      clearTimeout(timer);
      child.off("close", handleClose);
      resolve(true);
    };
    child.on("close", handleClose);
  });
}

function awaitWithCancellation<T>(
  promise: Promise<T>,
  timeoutSignal: AbortSignal,
  callSignal?: AbortSignal,
): Promise<T> {
  if (timeoutSignal.aborted) return Promise.reject(new Error("CodeGraph MCP session timed out."));
  if (callSignal?.aborted) return Promise.reject(new Error("CodeGraph MCP session aborted."));
  return new Promise<T>((resolve, reject) => {
    const onTimeout = () => finish(() => reject(new Error("CodeGraph MCP session timed out.")));
    const onAbort = () => finish(() => reject(new Error("CodeGraph MCP session aborted.")));
    const finish = (complete: () => void) => {
      timeoutSignal.removeEventListener("abort", onTimeout);
      callSignal?.removeEventListener("abort", onAbort);
      complete();
    };
    timeoutSignal.addEventListener("abort", onTimeout, { once: true });
    callSignal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error("CodeGraph MCP session aborted.");
}

function describeSessionError(error: unknown): string {
  return error instanceof Error ? boundedDiagnostic(error.message) : "CodeGraph MCP session failed.";
}

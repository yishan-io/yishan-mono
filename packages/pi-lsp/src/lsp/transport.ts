/**
 * JSON-RPC transport for one language server process: spawns the child,
 * frames messages with Content-Length headers, and tracks in-flight
 * requests. Protocol semantics live in LspClient; this module only moves
 * bytes.
 */
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import process from "node:process";

import { effectivePath, mergeEnv, resolveExecutable, resolveSpawnCommand } from "../helpers/commands";
import type { JsonRpcMessage, ServerCommand } from "../types";

/**
 * Runs a child process and speaks framed JSON-RPC with it.
 */
export class LspTransport {
  #child?: ChildProcessWithoutNullStreams;
  #buffer = Buffer.alloc(0);
  #nextId = 1;
  #pending = new Map<
    number,
    {
      resolve: (result: unknown) => void;
      reject: (reason: unknown) => void;
      timer: NodeJS.Timeout;
    }
  >();
  #stderr = "";
  #serverName: string;
  #command: ServerCommand;
  #cwd: string;
  #env: Record<string, string> | undefined;
  #timeoutMs: number;

  /**
   * Receives every parsed message that is not a response to a request made
   * through this transport (notifications and server-to-client requests).
   */
  onMessage: ((message: JsonRpcMessage) => void) | undefined;

  /**
   * Called when the transport closes or fails so the protocol layer can
   * reject its own waiters.
   */
  onClosed: (() => void) | undefined;

  constructor(
    serverName: string,
    command: ServerCommand,
    cwd: string,
    env: Record<string, string> | undefined,
    timeoutMs: number,
  ) {
    this.#serverName = serverName;
    this.#command = command;
    this.#cwd = cwd;
    this.#env = env;
    this.#timeoutMs = timeoutMs;
  }

  /**
   * Returns whether a child process is currently attached.
   */
  get isRunning(): boolean {
    return this.#child !== undefined;
  }

  /**
   * Returns the request timeout in milliseconds.
   */
  get timeoutMs(): number {
    return this.#timeoutMs;
  }

  /**
   * Returns the working directory the child was spawned in.
   */
  get cwd(): string {
    return this.#cwd;
  }

  /**
   * Resolves the command path and spawns the server child process.
   */
  async start(): Promise<void> {
    const executable = resolveExecutable(this.#command.command, this.#cwd, process.platform, effectivePath(this.#env));
    if (!executable) {
      throw new Error(
        `${this.#serverName} LSP command not found: ${this.#command.command}. ` +
          `Install ${this.#serverName} or update its command in lsp.json.`,
      );
    }

    const spawnCommand = resolveSpawnCommand({ ...this.#command, command: executable });
    const child = spawn(spawnCommand.command, spawnCommand.args, {
      cwd: this.#cwd,
      env: mergeEnv(this.#env),
      stdio: "pipe",
    });
    this.#child = child;

    child.stdout.on("data", (chunk) => {
      try {
        this.#consume(chunk);
      } catch (error) {
        this.#fail(
          `${this.#serverName} LSP server sent invalid JSON-RPC data: ${describe(error)}.${this.#stderrSuffix()}`,
        );
      }
    });
    child.stderr.on("data", (chunk) => {
      this.#stderr += chunk.toString();
    });
    child.stdin.on("error", (error) => {
      this.#fail(`${this.#serverName} LSP stdin write failed: ${describe(error)}.${this.#stderrSuffix()}`);
    });
    child.once("exit", (code, signal) => {
      if (this.#child === child) this.#child = undefined;
      const reason = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
      this.#rejectPending(
        (id) => `${this.#serverName} LSP server exited before response ${id} (${reason}).${this.#stderrSuffix()}`,
      );
    });

    await new Promise<void>((resolve, reject) => {
      child.once("spawn", resolve);
      child.once("error", (error) => {
        const message = `${this.#serverName} LSP process failed to start: ${error.message}.${this.#stderrSuffix()}`;
        this.#rejectPending(message);
        if (this.#child === child) this.#child = undefined;
        reject(new Error(message));
      });
    });
  }

  /**
   * Sends a request and resolves with the response result, rejecting on
   * error, timeout, or child exit.
   */
  request(method: string, params: unknown): Promise<unknown> {
    const id = this.#nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`${this.#serverName} LSP request timed out: ${method}.${this.#stderrSuffix()}`));
      }, this.#timeoutMs);
      this.#pending.set(id, { resolve, reject, timer });

      try {
        this.#send({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.#pending.delete(id);
        reject(error);
      }
    });
  }

  /**
   * Sends a notification (no response expected).
   */
  notify(method: string, params?: unknown): void {
    this.#send(params === undefined ? { jsonrpc: "2.0", method } : { jsonrpc: "2.0", method, params });
  }

  /**
   * Sends a response to a server-to-client request.
   */
  respond(id: number | string | null, result: unknown): void {
    this.#send({ jsonrpc: "2.0", id, result });
  }

  /**
   * Sends an error response to a server-to-client request.
   */
  respondError(id: number | string | null, code: number, message: string): void {
    this.#send({ jsonrpc: "2.0", id, error: { code, message } });
  }

  /**
   * Rejects pending requests, terminates the child, and notifies the
   * protocol layer. Safe when no child is running.
   */
  close(): void {
    this.#rejectPending(`${this.#serverName} LSP request cancelled.`);
    if (this.#child && !this.#child.killed) this.#child.kill("SIGTERM");
    this.#child = undefined;
    this.onClosed?.();
  }

  /**
   * Rejects pending requests with a fatal message and terminates the child.
   */
  #fail(message: string): void {
    this.#rejectPending(message);
    if (this.#child && !this.#child.killed) this.#child.kill("SIGTERM");
    this.#child = undefined;
    this.onClosed?.();
  }

  #rejectPending(message: string | ((id: number) => string)): void {
    for (const [id, pending] of this.#pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(typeof message === "string" ? message : message(id)));
    }
    this.#pending.clear();
  }

  #send(message: JsonRpcMessage): void {
    if (!this.#child) throw new Error(`${this.#serverName} LSP server is not running.`);
    const body = JSON.stringify(message);
    try {
      this.#child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    } catch (error) {
      const message_ = `${this.#serverName} LSP stdin write failed: ${describe(error)}.${this.#stderrSuffix()}`;
      this.#fail(message_);
      throw new Error(message_);
    }
  }

  /**
   * Appends a chunk to the framing buffer and processes complete messages.
   */
  #consume(chunk: Buffer): void {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    for (;;) {
      const separator = this.#buffer.indexOf("\r\n\r\n");
      if (separator < 0) return;

      const header = this.#buffer.subarray(0, separator).toString("utf8");
      const lengthMatch = /Content-Length:\s*(\d+)/i.exec(header);
      if (!lengthMatch?.[1]) throw new Error(`Invalid LSP response header: ${header}`);

      const bodyStart = separator + 4;
      const bodyLength = Number(lengthMatch[1]);
      if (this.#buffer.length < bodyStart + bodyLength) return;

      const rawBody = this.#buffer.subarray(bodyStart, bodyStart + bodyLength).toString("utf8");
      this.#buffer = this.#buffer.subarray(bodyStart + bodyLength);
      this.#handle(JSON.parse(rawBody) as JsonRpcMessage);
    }
  }

  /**
   * Routes one message: responses resolve pending requests; everything else
   * is forwarded to the protocol layer.
   */
  #handle(message: JsonRpcMessage): void {
    if (Object.hasOwn(message, "id") && !message.method) {
      const pending = typeof message.id === "number" ? this.#pending.get(message.id) : undefined;
      if (!pending) return;
      clearTimeout(pending.timer);
      this.#pending.delete(message.id as number);
      if (message.error) {
        pending.reject(new Error(`${this.#serverName} LSP error: ${message.error.message}`));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    this.onMessage?.(message);
  }

  #stderrSuffix(): string {
    const stderr = this.#stderr.trim();
    return stderr ? `\nServer stderr:\n${stderr}` : "";
  }
}

/**
 * Converts an unknown thrown value into a readable message.
 */
export function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

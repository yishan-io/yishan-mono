import {
  type CreateLocalTaskInput,
  type LocalTask,
  type LocalTaskContextDetails,
  type LocalTaskFilters,
  type LocalTaskSearchResult,
  type LocalTaskWorkspaceLink,
  type UpdateLocalTaskInput,
  parseLocalTask,
  parseLocalTaskContextDetails,
  parseLocalTaskID,
  parseLocalTaskList,
  parseLocalTaskSearchResults,
  parseLocalTaskWorkspaceLink,
} from "./localTaskTypes";

const RPC_ID = 1;
const DEFAULT_CONNECT_TIMEOUT_MS = 5_000;
const DEFAULT_RESPONSE_TIMEOUT_MS = 15_000;

/** Minimal global WebSocket contract required by this one-shot client. */
export type LocalTaskWebSocket = Pick<WebSocket, "send" | "close" | "addEventListener" | "removeEventListener">;
/** Injectable global WebSocket constructor. */
export type LocalTaskWebSocketConstructor = new (url: string) => LocalTaskWebSocket;
/** Time limits and cancellation accepted by a daemon RPC call. */
export type LocalTaskRpcOptions = { signal?: AbortSignal; connectTimeoutMs?: number; responseTimeoutMs?: number };

/** A JSON-RPC error returned by the local daemon. */
export class LocalTaskRPCError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "LocalTaskRPCError";
  }
}

function getWebSocketConstructor(): LocalTaskWebSocketConstructor {
  if (typeof WebSocket === "undefined") throw new Error("Local Task daemon WebSocket is unavailable");
  return WebSocket;
}

function isPositiveTimeout(value: number | undefined, fallback: number): number {
  const timeout = value ?? fallback;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new TypeError("invalid Local Task RPC timeout");
  return timeout;
}

const DAEMON_WS_ENDPOINT_PATTERN = /^ws:\/\/(?:127\.0\.0\.1|\[::1\]):([1-9][0-9]{0,4})\/ws$/;
const MAX_TCP_PORT = 65_535;

/** Validates the exact loopback endpoint form published by the local daemon. */
export function validateLocalTaskDaemonURL(endpoint: string): string {
  const endpointMatch = DAEMON_WS_ENDPOINT_PATTERN.exec(endpoint);
  if (endpointMatch === null || Number(endpointMatch[1]) > MAX_TCP_PORT)
    throw new TypeError("invalid Local Task daemon endpoint");
  return endpoint;
}

function parseResponse(payload: unknown): unknown {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload))
    throw new TypeError("invalid Local Task RPC response");
  const response = payload as Record<string, unknown>;
  const hasResult = Object.hasOwn(response, "result");
  const hasError = Object.hasOwn(response, "error");
  if (
    response.jsonrpc !== "2.0" ||
    response.id !== RPC_ID ||
    hasResult === hasError ||
    Object.keys(response).length !== 3 ||
    !Object.keys(response).every((key) => key === "jsonrpc" || key === "id" || key === "result" || key === "error")
  ) {
    throw new TypeError("invalid Local Task RPC response");
  }
  if (hasResult) return response.result;
  const error = response.error;
  if (error === null || typeof error !== "object" || Array.isArray(error))
    throw new TypeError("invalid Local Task RPC response");
  const errorRecord = error as Record<string, unknown>;
  if (
    typeof errorRecord.code !== "number" ||
    !Number.isInteger(errorRecord.code) ||
    typeof errorRecord.message !== "string" ||
    !Object.keys(errorRecord).every((key) => key === "code" || key === "message" || key === "data")
  ) {
    throw new TypeError("invalid Local Task RPC response");
  }
  throw new LocalTaskRPCError(errorRecord.code, errorRecord.message, errorRecord.data);
}

function parseTextFrame(data: unknown): unknown {
  if (typeof data !== "string") throw new TypeError("invalid Local Task RPC frame");
  try {
    return JSON.parse(data) as unknown;
  } catch {
    throw new TypeError("invalid Local Task RPC frame");
  }
}

/** One-shot, bounded JSON-RPC connection to the local daemon. */
export class LocalTaskRpcClient {
  constructor(
    private readonly endpoint: string,
    private readonly webSocketConstructor: LocalTaskWebSocketConstructor = getWebSocketConstructor(),
  ) {}

  /** Invokes one daemon method with explicit object params. */
  private async call(
    method: string,
    params: Record<string, unknown>,
    options: LocalTaskRpcOptions = {},
  ): Promise<unknown> {
    const endpoint = validateLocalTaskDaemonURL(this.endpoint);
    if (options.signal?.aborted) throw new DOMException("Local Task RPC aborted", "AbortError");
    const connectTimeoutMs = isPositiveTimeout(options.connectTimeoutMs, DEFAULT_CONNECT_TIMEOUT_MS);
    const responseTimeoutMs = isPositiveTimeout(options.responseTimeoutMs, DEFAULT_RESPONSE_TIMEOUT_MS);
    const request = JSON.stringify({ jsonrpc: "2.0", id: RPC_ID, method, params });
    return new Promise<unknown>((resolve, reject) => {
      let socket: LocalTaskWebSocket | undefined;
      let responseTimer: ReturnType<typeof setTimeout> | undefined;
      const connectTimer = setTimeout(() => finish(new Error("Local Task RPC connection timed out")), connectTimeoutMs);
      const finish = (outcome: unknown, isSuccess = false): void => {
        clearTimeout(connectTimer);
        if (responseTimer) clearTimeout(responseTimer);
        options.signal?.removeEventListener("abort", handleAbort);
        if (socket) {
          socket.removeEventListener("open", handleOpen);
          socket.removeEventListener("message", handleMessage);
          socket.removeEventListener("error", handleError);
          socket.removeEventListener("close", handleClose);
          try {
            socket.close();
          } catch {
            /* best-effort cleanup */
          }
        }
        if (isSuccess) resolve(outcome);
        else reject(outcome);
      };
      const handleAbort = (): void => finish(new DOMException("Local Task RPC aborted", "AbortError"));
      const handleOpen = (): void => {
        clearTimeout(connectTimer);
        try {
          socket?.send(request);
        } catch {
          finish(new Error("Local Task RPC send failed"));
          return;
        }
        responseTimer = setTimeout(() => finish(new Error("Local Task RPC response timed out")), responseTimeoutMs);
      };
      const handleMessage = (event: MessageEvent): void => {
        try {
          finish(parseResponse(parseTextFrame(event.data)), true);
        } catch (error) {
          finish(error);
        }
      };
      const handleError = (): void => finish(new Error("Local Task RPC connection failed"));
      const handleClose = (): void => finish(new Error("Local Task RPC connection closed"));
      options.signal?.addEventListener("abort", handleAbort, { once: true });
      try {
        socket = new this.webSocketConstructor(endpoint);
        socket.addEventListener("open", handleOpen);
        socket.addEventListener("message", handleMessage);
        socket.addEventListener("error", handleError);
        socket.addEventListener("close", handleClose);
      } catch {
        finish(new Error("Local Task RPC connection failed"));
      }
    });
  }

  /** Creates one Local Task. */
  async create(input: CreateLocalTaskInput, options?: LocalTaskRpcOptions): Promise<LocalTask> {
    return parseLocalTask(await this.call("localTask.create", input, options));
  }
  /** Associates one Local Task with a local workspace. */
  async linkWorkspace(
    taskId: string,
    workspaceId: string,
    options?: LocalTaskRpcOptions,
  ): Promise<LocalTaskWorkspaceLink> {
    return parseLocalTaskWorkspaceLink(
      await this.call(
        "localTask.linkWorkspace",
        { taskId: parseLocalTaskID(taskId), workspaceId: parseLocalTaskID(workspaceId) },
        options,
      ),
    );
  }

  /** Loads one Local Task by opaque ID. */
  async get(id: string, options?: LocalTaskRpcOptions): Promise<LocalTask> {
    return parseLocalTask(await this.call("localTask.get", { id: parseLocalTaskID(id) }, options));
  }
  /** Lists Local Tasks matching optional filters. */
  async list(filters: LocalTaskFilters = {}, options?: LocalTaskRpcOptions): Promise<LocalTask[]> {
    return parseLocalTaskList(await this.call("localTask.list", filters, options));
  }
  /** Updates mutable Local Task metadata. */
  async update(id: string, input: UpdateLocalTaskInput, options?: LocalTaskRpcOptions): Promise<LocalTask> {
    return parseLocalTask(await this.call("localTask.update", { id: parseLocalTaskID(id), ...input }, options));
  }
  /** Searches Local Task metadata. */
  async search(
    query: string,
    filters: LocalTaskFilters = {},
    options?: LocalTaskRpcOptions,
  ): Promise<LocalTaskSearchResult[]> {
    return parseLocalTaskSearchResults(await this.call("localTask.search", { query, ...filters }, options));
  }
  /** Loads daemon-derived Task Context paths. */
  async getContextDetails(id: string, options?: LocalTaskRpcOptions): Promise<LocalTaskContextDetails> {
    return parseLocalTaskContextDetails(
      await this.call("localTask.getContextDetails", { id: parseLocalTaskID(id) }, options),
    );
  }
}

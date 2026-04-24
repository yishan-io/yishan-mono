import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import type * as Rpc from "./jsonRpcTypes";
import { isDevMode } from "../runtime/environment";

const DAEMON_STATE_FILE_NAME = "daemon.state.json";

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

export function readOptionalString(input: unknown): string | undefined {
  if (typeof input !== "string") {
    return undefined;
  }

  const value = input.trim();
  return value ? value : undefined;
}

export function readOptionalBoolean(input: unknown): boolean | undefined {
  return typeof input === "boolean" ? input : undefined;
}

export function readOptionalNumber(input: unknown): number | undefined {
  return typeof input === "number" && Number.isFinite(input) ? input : undefined;
}

export function readOptionalStringArray(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }

  const values: string[] = [];
  for (const candidate of input) {
    if (typeof candidate !== "string") {
      continue;
    }
    values.push(candidate);
  }

  return values;
}

export function normalizeWorktreePath(worktreePath: string): string {
  return resolve(worktreePath.trim());
}

function resolveCliProfileName(): string {
  if (isDevMode()) {
    return "dev";
  }

  return process.env.YISHAN_PROFILE?.trim() || "default";
}

function resolveDaemonStateFilePath(): string {
  return resolve(homedir(), ".yishan", "profiles", resolveCliProfileName(), DAEMON_STATE_FILE_NAME);
}

function ensureDaemonState(candidate: unknown): Rpc.DaemonState {
  const state = asRecord(candidate);
  if (!state) {
    throw new Error("daemon state is invalid");
  }

  const host = readOptionalString(state.host);
  const port = readOptionalNumber(state.port);
  if (!host) {
    throw new Error("daemon state host is invalid");
  }
  if (!port || port <= 0) {
    throw new Error("daemon state port is invalid");
  }

  return { host, port };
}

function toWebSocketPayload(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  }

  throw new Error("unsupported websocket payload");
}

export function parseJsonRpcMessage(data: unknown): Rpc.JsonRpcResponse | Rpc.JsonRpcNotification {
  const payload = toWebSocketPayload(data);
  const parsed = JSON.parse(payload) as Rpc.JsonRpcResponse | Rpc.JsonRpcNotification;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("daemon websocket payload is invalid");
  }

  if ((parsed as { jsonrpc?: unknown }).jsonrpc !== "2.0") {
    throw new Error("daemon websocket payload is not JSON-RPC 2.0");
  }

  return parsed;
}

async function resolveDaemonWebSocketUrl(): Promise<string> {
  const explicitUrl = process.env.YISHAN_DAEMON_WS_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  const stateRaw = await readFile(resolveDaemonStateFilePath(), "utf8");
  const state = ensureDaemonState(JSON.parse(stateRaw));
  return `ws://${state.host}:${state.port}/ws`;
}

export async function openSocket(): Promise<WebSocket> {
  const url = await resolveDaemonWebSocketUrl();

  return await new Promise<WebSocket>((resolvePromise, rejectPromise) => {
    const socket = new WebSocket(url);
    let settled = false;

    const resolveOnce = (value: WebSocket) => {
      if (settled) {
        return;
      }
      settled = true;
      resolvePromise(value);
    };

    const rejectOnce = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      rejectPromise(error);
    };

    socket.addEventListener("open", () => {
      resolveOnce(socket);
    });

    socket.addEventListener("error", () => {
      rejectOnce(new Error("failed to connect to daemon websocket"));
    });

    socket.addEventListener("close", () => {
      rejectOnce(new Error("daemon websocket closed before opening"));
    });
  });
}

export function buildRequest(method: string, params?: unknown): Rpc.JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id: randomUUID(),
    method,
    params,
  };
}

export function buildUnsupportedMethodError(path: string): Error {
  return new Error(`desktop daemon JSON-RPC does not support procedure \"${path}\"`);
}

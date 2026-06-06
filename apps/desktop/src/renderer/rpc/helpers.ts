import { generateId } from "../helpers/generateId";
import type * as Rpc from "./daemonTypes";
export { delay } from "../helpers/delay";

function toWebSocketPayload(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }

  if (ArrayBuffer.isView(data)) {
    return new TextDecoder().decode(data);
  }

  throw new Error("unsupported websocket payload");
}

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
  return value || undefined;
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
    if (typeof candidate === "string") {
      values.push(candidate);
    }
  }

  return values;
}

export function normalizeWorktreePath(worktreePath: string): string {
  const trimmedPath = worktreePath.trim();
  if (!trimmedPath) {
    return "";
  }

  const slashNormalizedPath = trimmedPath.replace(/\\/g, "/");
  if (slashNormalizedPath === "/") {
    return "/";
  }

  return slashNormalizedPath.replace(/\/+$/, "");
}

export function buildRequest(method: string, params?: unknown): Rpc.JsonRpcRequest {
  return {
    jsonrpc: "2.0",
    id: generateId(),
    method,
    params,
  };
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

export function buildUnsupportedMethodError(path: string): Error {
  return new Error(`desktop daemon JSON-RPC does not support procedure "${path}"`);
}

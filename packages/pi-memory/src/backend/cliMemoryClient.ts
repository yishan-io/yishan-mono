import { execFile } from "node:child_process";

import type { MemoryBackendClient, MemoryReconcileResult, MemorySearchInput, MemorySearchResult } from "./types";

/**
 * Creates a backend client that shells out to `yishan memory` commands.
 */
export function createCliMemoryClient(): MemoryBackendClient {
  return {
    async search(input: MemorySearchInput): Promise<MemorySearchResult[]> {
      const args = ["memory", "search", "--output", "json"];
      if (input.projectId) {
        args.push("--project-id", input.projectId);
      }
      if (input.scope) {
        args.push("--scope", input.scope);
      }
      if (typeof input.limit === "number") {
        args.push("--limit", String(input.limit));
      }
      args.push(input.query);

      const stdout = await runYishanCommand(args);
      return parseSearchResults(stdout);
    },
    async reconcile(): Promise<MemoryReconcileResult> {
      const stdout = await runYishanCommand(["memory", "reconcile", "--output", "json"]);
      return parseReconcileResult(stdout);
    },
  };
}

function runYishanCommand(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("yishan", args, { cwd: process.cwd() }, (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout);
    });
  });
}

function parseSearchResults(stdout: string): MemorySearchResult[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Invalid yishan memory search JSON output: ${getErrorMessage(error)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Invalid yishan memory search JSON output: expected an array");
  }

  return parsed.map((item) => {
    if (!isMemorySearchResult(item)) {
      throw new Error("Invalid yishan memory search JSON output: expected search result objects");
    }
    return item;
  });
}

function parseReconcileResult(stdout: string): MemoryReconcileResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Invalid yishan memory reconcile JSON output: ${getErrorMessage(error)}`);
  }

  if (!isMemoryReconcileResult(parsed)) {
    throw new Error("Invalid yishan memory reconcile JSON output: expected an object with status");
  }

  return parsed;
}

function isMemorySearchResult(value: unknown): value is MemorySearchResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.path === "string" && typeof candidate.snippet === "string" && typeof candidate.score === "number"
  );
}

function isMemoryReconcileResult(value: unknown): value is MemoryReconcileResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  return typeof (value as Record<string, unknown>).status === "string";
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

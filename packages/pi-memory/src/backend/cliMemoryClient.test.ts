import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));
vi.mock("node:child_process", () => ({ execFile: execFileMock }));

import { createCliMemoryClient } from "./cliMemoryClient";

describe("createCliMemoryClient", () => {
  beforeEach(() => {
    execFileMock.mockReset();
    vi.unstubAllEnvs();
    vi.stubEnv("YISHAN_PROJECT_ID", "");
  });

  it("runs yishan memory search and parses json results", async () => {
    execFileMock.mockImplementation((_cmd, _args, _options, callback) => {
      callback(null, JSON.stringify([{ path: "/tmp/MEMORY.md", snippet: "hit", score: 0.1 }]), "");
    });

    const client = createCliMemoryClient();
    const results = await client.search({ query: "auth", projectId: "proj-1", limit: 5 });

    expect(execFileMock).toHaveBeenCalledWith(
      "yishan",
      ["memory", "search", "--output", "json", "--project-id", "proj-1", "--limit", "5", "auth"],
      expect.any(Object),
      expect.any(Function),
    );
    expect(results).toEqual([{ path: "/tmp/MEMORY.md", snippet: "hit", score: 0.1 }]);
  });

  it("uses YISHAN_PROJECT_ID when project id is omitted", async () => {
    vi.stubEnv("YISHAN_PROJECT_ID", "proj-env");
    execFileMock.mockImplementation((_cmd, _args, _options, callback) => {
      callback(null, "[]", "");
    });

    const client = createCliMemoryClient();
    await client.search({ query: "auth" });

    expect(execFileMock).toHaveBeenCalledWith(
      "yishan",
      ["memory", "search", "--output", "json", "--project-id", "proj-env", "auth"],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("includes global scope without forcing project id from env", async () => {
    vi.stubEnv("YISHAN_PROJECT_ID", "proj-env");
    execFileMock.mockImplementation((_cmd, _args, _options, callback) => {
      callback(null, "[]", "");
    });

    const client = createCliMemoryClient();
    await client.search({ query: "auth", scope: "global" });

    expect(execFileMock).toHaveBeenCalledWith(
      "yishan",
      ["memory", "search", "--output", "json", "--scope", "global", "auth"],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("surfaces malformed json as an error", async () => {
    execFileMock.mockImplementation((_cmd, _args, _options, callback) => {
      callback(null, "not-json", "");
    });

    const client = createCliMemoryClient();
    await expect(client.search({ query: "auth" })).rejects.toThrow("Invalid yishan memory search JSON output");
  });

  it("runs reconcile as a repair path", async () => {
    execFileMock.mockImplementation((_cmd, _args, _options, callback) => {
      callback(null, JSON.stringify({ status: "reconciled" }), "");
    });

    const client = createCliMemoryClient();
    const result = await client.reconcile();

    expect(execFileMock).toHaveBeenCalledWith(
      "yishan",
      ["memory", "reconcile", "--output", "json"],
      expect.any(Object),
      expect.any(Function),
    );
    expect(result).toEqual({ status: "reconciled" });
  });
});

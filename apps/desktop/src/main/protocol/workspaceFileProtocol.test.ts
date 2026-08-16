import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (request: Request) => Promise<Response>>();
  return {
    handlers,
    fetchMock: vi.fn(),
    handleMock: vi.fn((scheme: string, handler: (request: Request) => Promise<Response>) => {
      handlers.set(scheme, handler);
    }),
  };
});

vi.mock("electron", () => ({
  protocol: {
    handle: mocks.handleMock,
  },
  net: {
    fetch: mocks.fetchMock,
  },
}));

import { registerWorkspaceFileProtocol } from "./workspaceFileProtocol";

function buildRequest(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe("workspaceFileProtocol", () => {
  afterEach(() => {
    mocks.handlers.clear();
    mocks.fetchMock.mockReset();
  });

  it("registers a handler for the yishan-file scheme", () => {
    registerWorkspaceFileProtocol();
    expect(mocks.handlers.has("yishan-file")).toBe(true);
  });

  it("rejects requests with the wrong hostname", async () => {
    registerWorkspaceFileProtocol();
    const handler = mocks.handlers.get("yishan-file")!;
    const response = await handler(buildRequest("yishan-file://wrong-host"));
    expect(response.status).toBe(404);
  });

  it("rejects requests missing workspaceWorktreePath or relativePath", async () => {
    registerWorkspaceFileProtocol();
    const handler = mocks.handlers.get("yishan-file")!;
    const response = await handler(
      buildRequest("yishan-file://workspace-file?workspaceWorktreePath=/tmp/worktree"),
    );
    expect(response.status).toBe(400);
  });

  it("rejects paths that escape the workspace root", async () => {
    registerWorkspaceFileProtocol();
    const handler = mocks.handlers.get("yishan-file")!;
    const response = await handler(
      buildRequest(
        "yishan-file://workspace-file?workspaceWorktreePath=/tmp/worktree&relativePath=../../etc/passwd",
      ),
    );
    expect(response.status).toBe(403);
  });

  it("serves the full file without a Range header", async () => {
    mocks.fetchMock.mockResolvedValueOnce(
      new Response("file-body", {
        status: 200,
        headers: { "Content-Type": "text/plain", "Accept-Ranges": "bytes" },
      }),
    );
    registerWorkspaceFileProtocol();
    const handler = mocks.handlers.get("yishan-file")!;
    const response = await handler(
      buildRequest("yishan-file://workspace-file?workspaceWorktreePath=/tmp/worktree&relativePath=src/main.ts"),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("file-body");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
  });

  it("returns 500 when the file read fails", async () => {
    mocks.fetchMock.mockRejectedValueOnce(new Error("ENOENT"));
    registerWorkspaceFileProtocol();
    const handler = mocks.handlers.get("yishan-file")!;
    const response = await handler(
      buildRequest("yishan-file://workspace-file?workspaceWorktreePath=/tmp/worktree&relativePath=missing.ts"),
    );
    expect(response.status).toBe(500);
  });
});

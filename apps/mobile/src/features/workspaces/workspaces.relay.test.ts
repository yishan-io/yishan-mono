import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearRelayNodeTokenCache } from "@/lib/relay/relay-node-token";
import { clearRelayRequestClientPool } from "@/lib/relay/relay-request-client-pool";
import {
  listRelayWorkspaceFiles,
  listRelayWorkspaceGitBranches,
  listRelayWorkspaceGitChanges,
  readRelayWorkspaceDiff,
  readRelayWorkspaceFile,
  startRelayWorkspaceCreate,
  writeRelayWorkspaceFile,
} from "./workspaces.relay";

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly listeners = {
    close: [] as Array<(event: CloseEvent) => void>,
    error: [] as Array<() => void>,
    message: [] as Array<(event: MessageEvent) => void>,
    open: [] as Array<() => void>,
  };
  readonly sentMessages: string[] = [];
  readyState = MockWebSocket.CONNECTING;

  constructor(readonly url: string) {}

  addEventListener(type: "open" | "message" | "error" | "close", listener: (...args: unknown[]) => void) {
    this.listeners[type].push(listener as never);
  }

  send(payload: string) {
    this.sentMessages.push(payload);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.emitClose("");
  }

  emitClose(reason: string) {
    this.readyState = MockWebSocket.CLOSED;
    for (const listener of this.listeners.close) {
      listener({ reason } as CloseEvent);
    }
  }

  emitMessage(data: unknown) {
    for (const listener of this.listeners.message) {
      listener({ data } as MessageEvent);
    }
  }

  emitOpen() {
    this.readyState = MockWebSocket.OPEN;
    for (const listener of this.listeners.open) {
      listener();
    }
  }
}

type PendingRequest = {
  request: Record<string, unknown>;
  socket: MockWebSocket;
};

describe("workspaces.relay", () => {
  const originalApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  const originalRelayUrl = process.env.EXPO_PUBLIC_RELAY_URL;
  let socketInstances: MockWebSocket[] = [];
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    socketInstances = [];
    process.env.EXPO_PUBLIC_API_BASE_URL = "http://api.test";
    process.env.EXPO_PUBLIC_RELAY_URL = "http://relay.test";
    fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ expiresAt: "2099-01-01T00:00:00.000Z", token: "relay-token" }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    class WebSocketStub extends MockWebSocket {
      static readonly CONNECTING = MockWebSocket.CONNECTING;
      static readonly OPEN = MockWebSocket.OPEN;
      static readonly CLOSING = MockWebSocket.CLOSING;
      static readonly CLOSED = MockWebSocket.CLOSED;

      constructor(url: string) {
        super(url);
        socketInstances.push(this);
      }
    }

    vi.stubGlobal("WebSocket", WebSocketStub);
  });

  afterEach(() => {
    clearRelayRequestClientPool();
    clearRelayNodeTokenCache();
    vi.useRealTimers();

    if (originalApiBaseUrl === undefined) {
      process.env.EXPO_PUBLIC_API_BASE_URL = undefined;
    } else {
      process.env.EXPO_PUBLIC_API_BASE_URL = originalApiBaseUrl;
    }

    if (originalRelayUrl === undefined) {
      process.env.EXPO_PUBLIC_RELAY_URL = undefined;
    } else {
      process.env.EXPO_PUBLIC_RELAY_URL = originalRelayUrl;
    }

    vi.unstubAllGlobals();
  });

  it("lists workspace files over relay", async () => {
    const filesPromise = listRelayWorkspaceFiles({
      accessToken: "access-token",
      nodeId: "node-1",
      path: "src",
      recursive: false,
      workspaceId: "workspace-1",
    });

    const { request, socket } = await waitForRequest();
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/nodes/node-1/relay-token",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(socket.url).toBe("http://relay.test/client/ws?nodeId=node-1&access_token=relay-token");
    expect(request.method).toBe("file.list");
    expect(request.params).toEqual({
      path: "src",
      recursive: false,
      workspaceId: "workspace-1",
    });

    socket.emitMessage(
      JSON.stringify({
        id: request.id,
        jsonrpc: "2.0",
        result: [
          {
            isDir: true,
            mode: 2147484141,
            name: "components",
            path: "src/components",
            size: 0,
          },
          {
            isDir: false,
            isIgnored: true,
            mode: 33188,
            name: "App.tsx",
            path: "src/App.tsx",
            size: 120,
          },
        ],
      }),
    );

    await expect(filesPromise).resolves.toEqual([
      {
        isDir: true,
        mode: 2147484141,
        name: "components",
        path: "src/components",
        size: 0,
      },
      {
        isDir: false,
        isIgnored: true,
        mode: 33188,
        name: "App.tsx",
        path: "src/App.tsx",
        size: 120,
      },
    ]);
  });

  it("reads and clips workspace file content over relay", async () => {
    const filePromise = readRelayWorkspaceFile({
      accessToken: "access-token",
      maxChars: 5,
      nodeId: "node-1",
      path: "README.md",
      workspaceId: "workspace-1",
    });

    const { request, socket } = await waitForRequest();
    expect(request.method).toBe("file.read");
    expect(request.params).toEqual({
      path: "README.md",
      workspaceId: "workspace-1",
    });

    socket.emitMessage(
      JSON.stringify({
        id: request.id,
        jsonrpc: "2.0",
        result: { content: "abcdef" },
      }),
    );

    await expect(filePromise).resolves.toEqual({
      content: "abcde",
      path: "README.md",
      truncated: true,
    });
  });

  it("reads and clips workspace diffs over relay", async () => {
    const diffPromise = readRelayWorkspaceDiff({
      accessToken: "access-token",
      maxChars: 4,
      nodeId: "node-1",
      path: "src/App.tsx",
      workspaceId: "workspace-1",
    });

    const { request, socket } = await waitForRequest();
    expect(request.method).toBe("file.diff");
    expect(request.params).toEqual({
      path: "src/App.tsx",
      workspaceId: "workspace-1",
    });

    socket.emitMessage(
      JSON.stringify({
        id: request.id,
        jsonrpc: "2.0",
        result: {
          newContent: "123456",
          oldContent: "abcd",
        },
      }),
    );

    await expect(diffPromise).resolves.toEqual({
      newContent: "1234",
      oldContent: "abcd",
      path: "src/App.tsx",
      truncated: true,
    });
  });

  it("writes workspace files over relay", async () => {
    const writePromise = writeRelayWorkspaceFile({
      accessToken: "access-token",
      content: "aGVsbG8=",
      encoding: "base64",
      nodeId: "node-1",
      path: ".my-context/uploads/image.png",
      workspaceId: "workspace-1",
    });

    const { request, socket } = await waitForRequest();
    expect(request.method).toBe("file.write");
    expect(request.params).toEqual({
      content: "aGVsbG8=",
      encoding: "base64",
      mode: 0,
      path: ".my-context/uploads/image.png",
      workspaceId: "workspace-1",
    });

    socket.emitMessage(
      JSON.stringify({
        id: request.id,
        jsonrpc: "2.0",
        result: 5,
      }),
    );

    await expect(writePromise).resolves.toBe(5);
  });

  it("starts workspace creation over relay", async () => {
    const createPromise = startRelayWorkspaceCreate({
      accessToken: "access-token",
      id: "workspace-1",
      organizationId: "org-1",
      projectId: "project-1",
      nodeId: "node-1",
      workspaceName: "feature-mobile",
      sourceBranch: "origin/main",
      branch: "feature-mobile",
    });

    const { request, socket } = await waitForRequest();
    expect(request.method).toBe("workspace.create");
    expect(request.params).toEqual({
      id: "workspace-1",
      organizationId: "org-1",
      projectId: "project-1",
      nodeId: "node-1",
      workspaceName: "feature-mobile",
      sourceBranch: "origin/main",
      branch: "feature-mobile",
      kind: "worktree",
    });

    socket.emitMessage(
      JSON.stringify({
        id: request.id,
        jsonrpc: "2.0",
        result: {
          id: "workspace-1",
          status: "pending",
        },
      }),
    );

    await expect(createPromise).resolves.toEqual({
      id: "workspace-1",
      status: "pending",
    });
  });

  it("treats skipped relay diffs as unavailable instead of invalid payloads", async () => {
    const diffPromise = readRelayWorkspaceDiff({
      accessToken: "access-token",
      nodeId: "node-1",
      path: "assets/logo.png",
      workspaceId: "workspace-1",
    });

    const { request, socket } = await waitForRequest();
    expect(request.method).toBe("file.diff");

    socket.emitMessage(
      JSON.stringify({
        id: request.id,
        jsonrpc: "2.0",
        result: {
          shouldSkipDecorations: true,
        },
      }),
    );

    await expect(diffPromise).resolves.toEqual({
      newContent: "",
      oldContent: "",
      path: "assets/logo.png",
      previewUnavailable: true,
    });
  });

  it("lists workspace git changes over relay", async () => {
    const changesPromise = listRelayWorkspaceGitChanges({
      accessToken: "access-token",
      nodeId: "node-1",
      workspaceId: "workspace-1",
    });

    const { request, socket } = await waitForRequest();
    expect(request.method).toBe("git.listChanges");
    expect(request.params).toEqual({
      workspaceId: "workspace-1",
    });

    socket.emitMessage(
      JSON.stringify({
        id: request.id,
        jsonrpc: "2.0",
        result: {
          staged: [],
          unstaged: [{ additions: 5, deletions: 1, kind: "modified", path: "src/App.tsx" }],
          untracked: [{ additions: 0, deletions: 0, kind: "untracked", path: "notes/todo.md" }],
        },
      }),
    );

    await expect(changesPromise).resolves.toEqual({
      staged: [],
      unstaged: [{ additions: 5, deletions: 1, kind: "modified", path: "src/App.tsx" }],
      untracked: [{ additions: 0, deletions: 0, kind: "untracked", path: "notes/todo.md" }],
    });
  });

  it("lists workspace git branches over relay", async () => {
    const branchesPromise = listRelayWorkspaceGitBranches({
      accessToken: "access-token",
      nodeId: "node-1",
      workspaceId: "workspace-1",
    });

    const { request, socket } = await waitForRequest();
    expect(request.method).toBe("git.branches");
    expect(request.params).toEqual({
      workspaceId: "workspace-1",
    });

    socket.emitMessage(
      JSON.stringify({
        id: request.id,
        jsonrpc: "2.0",
        result: {
          branches: [" origin/main ", "feature/test"],
          currentBranch: " feature/test ",
          localBranches: ["feature/test", "main"],
          remoteBranches: [" origin/main ", "origin/dev"],
          worktreeBranches: ["feature/test"],
        },
      }),
    );

    await expect(branchesPromise).resolves.toEqual({
      branches: ["origin/main", "feature/test"],
      currentBranch: "feature/test",
      localBranches: ["feature/test", "main"],
      remoteBranches: ["origin/main", "origin/dev"],
      worktreeBranches: ["feature/test"],
    });
  });

  it("fails fast when the workspace node id is missing", async () => {
    await expect(
      listRelayWorkspaceFiles({
        accessToken: "access-token",
        nodeId: "",
        workspaceId: "workspace-1",
      }),
    ).rejects.toThrow("Missing nodeId for relay workspace read.");

    expect(socketInstances).toHaveLength(0);
  });

  it("reuses one pooled relay request socket across sequential workspace reads", async () => {
    vi.useFakeTimers();

    const firstPromise = listRelayWorkspaceFiles({
      accessToken: "access-token",
      nodeId: "node-1",
      workspaceId: "workspace-1",
    });

    const first = await waitForRequest();
    first.socket.emitMessage(
      JSON.stringify({
        id: first.request.id,
        jsonrpc: "2.0",
        result: [],
      }),
    );
    await expect(firstPromise).resolves.toEqual([]);

    const secondPromise = listRelayWorkspaceGitChanges({
      accessToken: "access-token",
      nodeId: "node-1",
      workspaceId: "workspace-1",
    });

    await vi.waitFor(() => {
      expect(first.socket.sentMessages).toHaveLength(2);
    });

    const secondRequest = JSON.parse(first.socket.sentMessages[1] ?? "{}") as Record<string, unknown>;
    expect(secondRequest.method).toBe("git.listChanges");
    expect(socketInstances).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    first.socket.emitMessage(
      JSON.stringify({
        id: secondRequest.id,
        jsonrpc: "2.0",
        result: {
          staged: [],
          unstaged: [],
          untracked: [],
        },
      }),
    );

    await expect(secondPromise).resolves.toEqual({
      staged: [],
      unstaged: [],
      untracked: [],
    });
  });

  async function waitForRequest(): Promise<PendingRequest> {
    await vi.waitFor(() => {
      expect(socketInstances).toHaveLength(1);
    });

    const socket = socketInstances[0];
    socket?.emitOpen();

    await vi.waitFor(() => {
      expect(socket?.sentMessages).toHaveLength(1);
    });

    return {
      request: JSON.parse(socket?.sentMessages[0] ?? "{}") as Record<string, unknown>,
      socket: socket as MockWebSocket,
    };
  }
});

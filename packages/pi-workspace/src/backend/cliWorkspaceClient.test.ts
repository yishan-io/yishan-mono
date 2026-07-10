import { beforeEach, describe, expect, it, vi } from "vitest";

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));
vi.mock("node:child_process", () => ({ execFile: execFileMock }));

import { createCliWorkspaceClient } from "./cliWorkspaceClient";

describe("createCliWorkspaceClient", () => {
  beforeEach(() => {
    execFileMock.mockReset();
    vi.unstubAllEnvs();
    vi.stubEnv("YISHAN_ORG_ID", "");
    vi.stubEnv("YISHAN_PROJECT_ID", "");
    vi.stubEnv("YISHAN_WORKSPACE_ID", "");
  });

  it("runs workspace list with json output", async () => {
    execFileMock.mockImplementation((_cmd, _args, _options, callback) => {
      callback(null, JSON.stringify({ workspaces: [{ id: "ws-1", projectId: "proj-1", branch: "main" }] }), "");
    });

    const client = createCliWorkspaceClient();
    const result = await client.list({ projectId: "proj-1" });

    expect(execFileMock).toHaveBeenLastCalledWith(
      "yishan",
      ["workspace", "list", "--output", "json", "--project-id", "proj-1"],
      expect.any(Object),
      expect.any(Function),
    );
    expect(result).toEqual({ workspaces: [{ id: "ws-1", projectId: "proj-1", branch: "main" }] });
  });

  it("uses YISHAN_PROJECT_ID when project id is omitted", async () => {
    vi.stubEnv("YISHAN_PROJECT_ID", "proj-env");
    execFileMock.mockImplementation((_cmd, _args, _options, callback) => {
      callback(null, JSON.stringify({ workspaces: [] }), "");
    });

    const client = createCliWorkspaceClient();
    await client.list({});

    expect(execFileMock).toHaveBeenLastCalledWith(
      "yishan",
      ["workspace", "list", "--output", "json", "--project-id", "proj-env"],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("runs workspace find with a workspace id fallback from env", async () => {
    vi.stubEnv("YISHAN_PROJECT_ID", "proj-env");
    vi.stubEnv("YISHAN_WORKSPACE_ID", "ws-env");
    execFileMock.mockImplementation((_cmd, _args, _options, callback) => {
      callback(null, JSON.stringify({ workspace: { id: "ws-env" }, projectId: "proj-env" }), "");
    });

    const client = createCliWorkspaceClient();
    const result = await client.find({});

    expect(execFileMock).toHaveBeenLastCalledWith(
      "yishan",
      ["workspace", "find", "--output", "json", "--project-id", "proj-env", "--workspace-id", "ws-env"],
      expect.any(Object),
      expect.any(Function),
    );
    expect(result).toEqual({ workspace: { id: "ws-env" }, projectId: "proj-env" });
  });

  it("runs workspace create and parses the created workspace id and path", async () => {
    execFileMock.mockImplementation((_cmd, _args, _options, callback) => {
      callback(
        null,
        [
          "Creating workspace...",
          "  repo       complete  cloned",
          "",
          "Created: ws-123  /tmp/worktrees/feature-branch",
          "",
        ].join("\n"),
        "",
      );
    });

    const client = createCliWorkspaceClient();
    const result = await client.create({
      projectId: "proj-1",
      branch: "feature/branch",
      sourceBranch: "main",
      name: "feature-branch",
      taskRunAgentKind: "pi",
      taskRunPrompt: "Read task.md",
      taskRunModel: "sonnet",
    });

    expect(execFileMock).toHaveBeenLastCalledWith(
      "yishan",
      [
        "workspace",
        "create",
        "--project-id",
        "proj-1",
        "--branch",
        "feature/branch",
        "--source-branch",
        "main",
        "--name",
        "feature-branch",
        "--task-run-agent-kind",
        "pi",
        "--task-run-prompt",
        "Read task.md",
        "--task-run-model",
        "sonnet",
      ],
      expect.any(Object),
      expect.any(Function),
    );
    expect(result.workspaceId).toBe("ws-123");
    expect(result.localPath).toBe("/tmp/worktrees/feature-branch");
  });

  it("defaults workspace create sourceBranch to main when omitted", async () => {
    execFileMock.mockImplementation((_cmd, _args, _options, callback) => {
      callback(null, "Created: ws-124  /tmp/worktrees/feature-default\n", "");
    });

    const client = createCliWorkspaceClient();
    await client.create({
      projectId: "proj-1",
      branch: "feature/default-source",
    });

    expect(execFileMock).toHaveBeenLastCalledWith(
      "yishan",
      [
        "workspace",
        "create",
        "--project-id",
        "proj-1",
        "--branch",
        "feature/default-source",
        "--source-branch",
        "main",
      ],
      expect.any(Object),
      expect.any(Function),
    );
  });

  it("runs workspace close with environment fallbacks", async () => {
    vi.stubEnv("YISHAN_PROJECT_ID", "proj-env");
    vi.stubEnv("YISHAN_WORKSPACE_ID", "ws-env");
    execFileMock.mockImplementation((_cmd, _args, _options, callback) => {
      callback(null, JSON.stringify({ workspace: { id: "ws-env", status: "closed" } }), "");
    });

    const client = createCliWorkspaceClient();
    const result = await client.close({});

    expect(execFileMock).toHaveBeenLastCalledWith(
      "yishan",
      ["workspace", "close", "--output", "json", "--project-id", "proj-env", "--workspace-id", "ws-env"],
      expect.any(Object),
      expect.any(Function),
    );
    expect(result).toEqual({ workspace: { id: "ws-env", status: "closed" } });
  });
});

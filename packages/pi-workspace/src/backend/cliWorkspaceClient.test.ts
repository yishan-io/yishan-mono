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
  it.each(["started", "failed", undefined])("preserves workspace ID with optional run status %s", async (status) => {
    const stdout = [
      "Created: ws-run  /tmp/ws-run",
      ...(status ? [`Task run: ${status}`, "Task run session: session-1", "Task run title: Task reference"] : []),
    ].join("\n");
    execFileMock.mockImplementation((_cmd, _args, _options, callback) => callback(null, stdout, ""));
    const result = await createCliWorkspaceClient().create({ projectId: "proj-1", branch: "feature/run" });
    expect(result).toEqual({
      workspaceId: "ws-run",
      localPath: "/tmp/ws-run",
      stdout,
      ...(status ? { taskRunStatus: status, taskRunSessionId: "session-1", taskRunTitle: "Task reference" } : {}),
    });
  });
  it.each([
    {
      name: "progress started cannot override final failed metadata",
      lines: [
        "Task run: started",
        "Task run session: stale",
        "Task run title: stale",
        "Created: ws-final  /tmp/final",
        "Task run: failed",
        "Task run session: final-session",
        "Task run title: Final title",
      ],
      metadata: { taskRunStatus: "failed", taskRunSessionId: "final-session", taskRunTitle: "Final title" },
    },
    {
      name: "selects the final Created block instead of a progress copy",
      lines: [
        "Created: ws-stale  /tmp/stale",
        "Task run: started",
        "Task run session: stale",
        "Task run title: stale",
        "Creating workspace...",
        "Created: ws-final  /tmp/final",
        "Task run: failed",
      ],
      metadata: { taskRunStatus: "failed" },
    },
    {
      name: "does not borrow optional fields from progress",
      lines: ["Task run session: stale", "Task run title: stale", "Created: ws-final  /tmp/final", "Task run: started"],
      metadata: { taskRunStatus: "started" },
    },
    {
      name: "old CLI with injected progress has no real metadata",
      lines: ["Task run: started", "Task run session: stale", "Task run title: stale", "Created: ws-final  /tmp/final"],
      metadata: {},
    },
    {
      name: "does not cross a progress block after Created",
      lines: ["Created: ws-final  /tmp/final", "  repo complete", "Task run: started", "Task run session: stale"],
      metadata: {},
    },
    ...["Task run: failed", "Task run session: duplicate", "Task run title: duplicate"].map((duplicate) => ({
      name: `rejects duplicate completion field ${duplicate}`,
      lines: [
        "Created: ws-final  /tmp/final",
        "Task run: started",
        "Task run session: final-session",
        "Task run title: Final title",
        duplicate,
      ],
      metadata: {},
    })),
    {
      name: "multiline progress title cannot inject completion metadata",
      lines: [
        "  task running Task run title: First line",
        "Task run: started",
        "Task run session: stale",
        "Task run title: Second line",
        "Created: ws-final  /tmp/final",
        "Task run: failed",
        "Task run title: Final title",
      ],
      metadata: { taskRunStatus: "failed", taskRunTitle: "Final title" },
    },
    {
      name: "rejects multiline completion title with injected status",
      lines: [
        "Created: ws-final  /tmp/final",
        "Task run: started",
        "Task run title: First line",
        "Second line",
        "Task run: failed",
      ],
      metadata: {},
    },
    {
      name: "accepts CRLF completion with a normalized title",
      lines: [
        "Created: ws-final  /tmp/final\r",
        "Task run: started\r",
        "Task run session: final-session\r",
        "Task run title: First line Second line\r",
        "",
      ],
      metadata: { taskRunStatus: "started", taskRunSessionId: "final-session", taskRunTitle: "First line Second line" },
    },
  ])("$name", async ({ lines, metadata }) => {
    const stdout = `${lines.join("\n")}\n`;
    execFileMock.mockImplementation((_cmd, _args, _options, callback) => callback(null, stdout, ""));
    const result = await createCliWorkspaceClient().create({ projectId: "proj-1", branch: "feature/run" });
    expect(result).toEqual({ workspaceId: "ws-final", localPath: "/tmp/final", stdout, ...metadata });
  });
});

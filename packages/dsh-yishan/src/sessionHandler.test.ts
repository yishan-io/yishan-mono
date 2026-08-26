import { describe, expect, it, vi } from "vitest";

import { YishanUnsupportedMethodError, createSessionHandler } from "./sessionHandler";

const WORKSPACE_CWD = "/workspaces/yishan";
const OTHER_CWD = "/workspaces/other";

function createDependencies() {
  return {
    sessionQuery: {
      listSessions: vi.fn(),
      readSession: vi.fn(),
    },
    resumeSession: vi.fn(),
    disposeSession: vi.fn(),
    subagents: {
      listChildren: vi.fn(),
      listDescendants: vi.fn(),
    },
  };
}

describe("createSessionHandler", () => {
  it("disposes a live resumed session only after its persisted cwd matches", async () => {
    const dependencies = createDependencies();
    dependencies.sessionQuery.readSession.mockResolvedValue({
      session: { id: "session-1", createdAt: 1, cwd: WORKSPACE_CWD },
      events: [],
    });
    dependencies.disposeSession.mockResolvedValue(true);
    const handle = createSessionHandler(dependencies);

    await expect(handle("yishan.v1.session.dispose", { cwd: WORKSPACE_CWD, sessionId: "session-1" })).resolves.toEqual({
      sessionId: "session-1",
      disposed: true,
    });
    expect(dependencies.disposeSession).toHaveBeenCalledWith("session-1");
  });

  it("lists only top-level sessions for the exact workspace cwd", async () => {
    const dependencies = createDependencies();
    dependencies.sessionQuery.listSessions.mockResolvedValue([
      { header: { id: "current", createdAt: 1, cwd: WORKSPACE_CWD }, live: false, persisted: true },
      {
        header: { id: "child", createdAt: 2, cwd: WORKSPACE_CWD, parentSession: "current", delegationDepth: 1 },
        live: false,
        persisted: true,
      },
      {
        header: { id: "fork", createdAt: 3, cwd: WORKSPACE_CWD, parentSession: "closed-session" },
        live: true,
        persisted: true,
      },
      { header: { id: "other", createdAt: 4, cwd: OTHER_CWD }, live: false, persisted: true },
    ]);
    const handle = createSessionHandler(dependencies);

    await expect(handle("yishan.v1.session.list", { cwd: WORKSPACE_CWD })).resolves.toEqual({
      sessions: [
        { sessionId: "current", createdAt: 1, live: false, persisted: true },
        {
          sessionId: "fork",
          createdAt: 3,
          parentSession: "closed-session",
          live: true,
          persisted: true,
        },
      ],
    });
  });

  it("checks the persisted header before resuming the DSH agent", async () => {
    const dependencies = createDependencies();
    dependencies.sessionQuery.readSession.mockResolvedValue({
      session: { id: "session-1", createdAt: 1, cwd: WORKSPACE_CWD },
      events: [],
    });
    dependencies.sessionQuery.listSessions.mockResolvedValue([
      { header: { id: "session-1", createdAt: 1, cwd: WORKSPACE_CWD }, live: false, persisted: true },
    ]);
    dependencies.resumeSession.mockResolvedValue(undefined);
    const handle = createSessionHandler(dependencies);

    await expect(handle("yishan.v1.session.resume", { cwd: WORKSPACE_CWD, sessionId: "session-1" })).resolves.toEqual({
      sessionId: "session-1",
    });
    expect(dependencies.sessionQuery.readSession).toHaveBeenCalledWith("session-1");
    expect(dependencies.resumeSession).toHaveBeenCalledWith("session-1");
  });

  it("returns an already-live persisted session without resuming another agent", async () => {
    const dependencies = createDependencies();
    dependencies.sessionQuery.readSession.mockResolvedValue({
      session: { id: "session-1", createdAt: 1, cwd: WORKSPACE_CWD },
      events: [],
    });
    dependencies.sessionQuery.listSessions.mockResolvedValue([
      { header: { id: "session-1", createdAt: 1, cwd: WORKSPACE_CWD }, live: true, persisted: true },
    ]);
    const handle = createSessionHandler(dependencies);

    await expect(handle("yishan.v1.session.resume", { cwd: WORKSPACE_CWD, sessionId: "session-1" })).resolves.toEqual({
      sessionId: "session-1",
    });
    expect(dependencies.resumeSession).not.toHaveBeenCalled();
  });

  it("rejects resume when DSH has no persisted session", async () => {
    const dependencies = createDependencies();
    dependencies.sessionQuery.readSession.mockResolvedValue({
      session: { id: "session-1", createdAt: 1, cwd: WORKSPACE_CWD },
      events: [],
    });
    dependencies.sessionQuery.listSessions.mockResolvedValue([
      { header: { id: "session-1", createdAt: 1, cwd: WORKSPACE_CWD }, live: true, persisted: false },
    ]);
    const handle = createSessionHandler(dependencies);

    await expect(
      handle("yishan.v1.session.resume", { cwd: WORKSPACE_CWD, sessionId: "session-1" }),
    ).rejects.toMatchObject({ code: "YISHAN_SESSION_NOT_PERSISTED" });
  });

  it("rejects unsupported fields before querying DSH", async () => {
    const dependencies = createDependencies();
    const handle = createSessionHandler(dependencies);

    await expect(handle("yishan.v1.session.list", { cwd: WORKSPACE_CWD, ignored: true })).rejects.toThrow(
      "session list request has unsupported fields",
    );
    expect(dependencies.sessionQuery.listSessions).not.toHaveBeenCalled();
  });

  it("denies lineage when the root is absent or belongs to another cwd", async () => {
    const dependencies = createDependencies();
    dependencies.sessionQuery.listSessions.mockResolvedValue([]);
    const handle = createSessionHandler(dependencies);
    await expect(
      handle("yishan.v1.session.lineage", { cwd: WORKSPACE_CWD, rootSessionId: "root", mode: "children" }),
    ).rejects.toMatchObject({ code: "YISHAN_SESSION_NOT_FOUND" });

    dependencies.sessionQuery.listSessions.mockResolvedValue([
      { header: { id: "root", createdAt: 1, cwd: OTHER_CWD }, live: true, persisted: true },
    ]);
    await expect(
      handle("yishan.v1.session.lineage", { cwd: WORKSPACE_CWD, rootSessionId: "root", mode: "children" }),
    ).rejects.toMatchObject({ code: "YISHAN_SESSION_WORKSPACE_MISMATCH" });
  });

  it("maps only direct DSH-native subagent children without changing root session listing", async () => {
    const dependencies = createDependencies();
    dependencies.sessionQuery.listSessions.mockResolvedValue([
      { header: { id: "root", createdAt: 1, cwd: WORKSPACE_CWD }, live: true, persisted: true },
      {
        header: {
          id: "child",
          createdAt: 2,
          cwd: WORKSPACE_CWD,
          parentSession: "root",
          origin: "subagent",
          delegationDepth: 1,
        },
        live: false,
        persisted: true,
      },
      {
        header: {
          id: "outside",
          createdAt: 3,
          cwd: OTHER_CWD,
          parentSession: "root",
          origin: "subagent",
          delegationDepth: 1,
        },
        live: false,
        persisted: true,
      },
    ]);
    dependencies.subagents.listChildren.mockResolvedValue([
      { kind: "child", id: "child", activity: "inactive", hasChildren: false, mode: "one-shot" },
      { kind: "child", id: "outside", activity: "inactive", hasChildren: false, mode: "one-shot" },
    ]);
    const handle = createSessionHandler(dependencies);

    await expect(
      handle("yishan.v1.session.lineage", { cwd: WORKSPACE_CWD, rootSessionId: "root", mode: "children" }),
    ).resolves.toEqual({
      rootSessionId: "root",
      mode: "children",
      children: [
        {
          sessionId: "child",
          parentSessionId: "root",
          origin: "subagent",
          delegationDepth: 1,
          relativeDepth: 1,
          live: false,
          persisted: true,
          activity: "inactive",
          mode: "one-shot",
        },
      ],
    });
    await expect(handle("yishan.v1.session.list", { cwd: WORKSPACE_CWD })).resolves.toEqual({
      sessions: [{ sessionId: "root", createdAt: 1, live: true, persisted: true }],
    });
  });

  it("maps DSH-native descendants with durable and relative depths", async () => {
    const dependencies = createDependencies();
    dependencies.sessionQuery.listSessions.mockResolvedValue([
      { header: { id: "root", createdAt: 1, cwd: WORKSPACE_CWD }, live: true, persisted: true },
      {
        header: {
          id: "middle",
          createdAt: 2,
          cwd: WORKSPACE_CWD,
          parentSession: "root",
          origin: "subagent",
          delegationDepth: 1,
        },
        live: false,
        persisted: true,
      },
      {
        header: {
          id: "grandchild",
          createdAt: 3,
          cwd: WORKSPACE_CWD,
          parentSession: "middle",
          origin: "subagent",
          delegationDepth: 2,
        },
        live: true,
        persisted: false,
      },
    ]);
    dependencies.subagents.listDescendants.mockResolvedValue([
      {
        kind: "child",
        id: "grandchild",
        parentId: "middle",
        depth: 2,
        activity: "running",
        hasChildren: false,
        mode: "continuable",
        label: "review",
      },
    ]);
    const handle = createSessionHandler(dependencies);

    await expect(
      handle("yishan.v1.session.lineage", { cwd: WORKSPACE_CWD, rootSessionId: "root", mode: "descendants" }),
    ).resolves.toEqual({
      rootSessionId: "root",
      mode: "descendants",
      children: [
        {
          sessionId: "grandchild",
          parentSessionId: "middle",
          origin: "subagent",
          delegationDepth: 2,
          relativeDepth: 2,
          live: true,
          persisted: false,
          activity: "running",
          mode: "continuable",
          label: "review",
        },
      ],
    });
  });

  it("returns descendants with live unpersisted intermediate and root lineage", async () => {
    const dependencies = createDependencies();
    dependencies.sessionQuery.listSessions.mockResolvedValue([
      { header: { id: "root", createdAt: 1, cwd: WORKSPACE_CWD }, live: true, persisted: false },
      {
        header: {
          id: "middle",
          createdAt: 2,
          cwd: WORKSPACE_CWD,
          parentSession: "root",
          origin: "subagent",
          delegationDepth: 1,
        },
        live: true,
        persisted: false,
      },
      {
        header: {
          id: "child",
          createdAt: 3,
          cwd: WORKSPACE_CWD,
          parentSession: "middle",
          origin: "subagent",
          delegationDepth: 2,
        },
        live: true,
        persisted: false,
      },
    ]);
    dependencies.subagents.listDescendants.mockResolvedValue([
      {
        kind: "child",
        id: "child",
        parentId: "middle",
        depth: 2,
        activity: "running",
        hasChildren: false,
      },
    ]);
    const handle = createSessionHandler(dependencies);

    await expect(
      handle("yishan.v1.session.lineage", { cwd: WORKSPACE_CWD, rootSessionId: "root", mode: "descendants" }),
    ).resolves.toMatchObject({
      rootSessionId: "root",
      children: [{ sessionId: "child", parentSessionId: "middle", live: true, persisted: false }],
    });
  });

  it("excludes descendants with cross-workspace, cyclic, or missing parent ancestry", async () => {
    const dependencies = createDependencies();
    dependencies.sessionQuery.listSessions.mockResolvedValue([
      { header: { id: "root", createdAt: 1, cwd: WORKSPACE_CWD }, live: true, persisted: true },
      {
        header: {
          id: "valid-parent",
          createdAt: 2,
          cwd: WORKSPACE_CWD,
          parentSession: "root",
          origin: "subagent",
          delegationDepth: 1,
        },
        live: false,
        persisted: true,
      },
      {
        header: {
          id: "valid-child",
          createdAt: 3,
          cwd: WORKSPACE_CWD,
          parentSession: "valid-parent",
          origin: "subagent",
          delegationDepth: 2,
        },
        live: false,
        persisted: true,
      },
      {
        header: {
          id: "cross-parent",
          createdAt: 4,
          cwd: OTHER_CWD,
          parentSession: "root",
          origin: "subagent",
          delegationDepth: 1,
        },
        live: false,
        persisted: true,
      },
      {
        header: {
          id: "cross-child",
          createdAt: 5,
          cwd: WORKSPACE_CWD,
          parentSession: "cross-parent",
          origin: "subagent",
          delegationDepth: 2,
        },
        live: false,
        persisted: true,
      },
      {
        header: {
          id: "cycle-a",
          createdAt: 6,
          cwd: WORKSPACE_CWD,
          parentSession: "cycle-b",
          origin: "subagent",
          delegationDepth: 2,
        },
        live: false,
        persisted: true,
      },
      {
        header: {
          id: "cycle-b",
          createdAt: 7,
          cwd: WORKSPACE_CWD,
          parentSession: "cycle-a",
          origin: "subagent",
          delegationDepth: 1,
        },
        live: false,
        persisted: true,
      },
      {
        header: {
          id: "missing-parent",
          createdAt: 8,
          cwd: WORKSPACE_CWD,
          parentSession: "absent",
          origin: "subagent",
          delegationDepth: 2,
        },
        live: false,
        persisted: true,
      },
    ]);
    dependencies.subagents.listDescendants.mockResolvedValue([
      {
        kind: "child",
        id: "valid-child",
        parentId: "valid-parent",
        depth: 2,
        activity: "inactive",
        hasChildren: false,
      },
      {
        kind: "child",
        id: "cross-child",
        parentId: "cross-parent",
        depth: 2,
        activity: "inactive",
        hasChildren: false,
      },
      { kind: "child", id: "cycle-a", parentId: "cycle-b", depth: 2, activity: "inactive", hasChildren: false },
      { kind: "child", id: "missing-parent", parentId: "absent", depth: 2, activity: "inactive", hasChildren: false },
    ]);
    const handle = createSessionHandler(dependencies);

    await expect(
      handle("yishan.v1.session.lineage", { cwd: WORKSPACE_CWD, rootSessionId: "root", mode: "descendants" }),
    ).resolves.toMatchObject({
      rootSessionId: "root",
      children: [{ sessionId: "valid-child", parentSessionId: "valid-parent" }],
    });
  });

  it("rejects extension methods outside the corrected Phase 2 surface", async () => {
    const handle = createSessionHandler(createDependencies());

    await expect(handle("yishan.v1.session.unknown", {})).rejects.toBeInstanceOf(YishanUnsupportedMethodError);
  });
});

describe("Yishan execution routing", () => {
  it("routes start through the unified execution owner instead of stock routing", async () => {
    const dependencies = createDependencies();
    const execution = {
      start: vi.fn(async () => ({ sessionId: "session-1", incarnation: "run-1" })),
      prompt: vi.fn(),
      cancel: vi.fn(),
      flushSession: vi.fn(),
      subscribe: vi.fn(),
      readDurableSession: vi.fn(),
      resume: vi.fn(),
      disposeSession: vi.fn(),
    };
    const handle = createSessionHandler({ ...dependencies, execution });
    await expect(
      handle("yishan.v1.session.start", {
        cwd: WORKSPACE_CWD,
        sessionId: "session-1",
        binding: {
          version: 1,
          workspaceId: "workspace-1",
          projectId: "",
          organizationId: "",
          ownerNodeId: "node-1",
          cwd: WORKSPACE_CWD,
        },
      }),
    ).resolves.toEqual({
      sessionId: "session-1",
      incarnation: "run-1",
    });
    expect(execution.start).toHaveBeenCalledWith({
      cwd: WORKSPACE_CWD,
      sessionId: "session-1",
      binding: {
        version: 1,
        workspaceId: "workspace-1",
        projectId: "",
        organizationId: "",
        ownerNodeId: "node-1",
        cwd: WORKSPACE_CWD,
      },
    });
  });
});

import { describe, expect, it, vi } from "vitest";

import {
  YishanSessionWorkspaceMismatchError,
  YishanUnsupportedMethodError,
  createSessionHandler,
} from "./sessionHandler";

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

  it("reads a session only after its header matches the requested workspace cwd", async () => {
    const dependencies = createDependencies();
    dependencies.sessionQuery.readSession.mockResolvedValue({
      session: { id: "session-1", createdAt: 1, cwd: WORKSPACE_CWD },
      events: [{ type: "turn/end" }],
    });
    const handle = createSessionHandler(dependencies);

    await expect(handle("yishan.v1.session.read", { cwd: WORKSPACE_CWD, sessionId: "session-1" })).resolves.toEqual({
      session: { sessionId: "session-1", createdAt: 1 },
      events: [{ type: "turn/end" }],
    });
  });

  it("rejects a read when DSH returns a different session identity", async () => {
    const dependencies = createDependencies();
    dependencies.sessionQuery.readSession.mockResolvedValue({
      session: { id: "different-session", createdAt: 1, cwd: WORKSPACE_CWD },
      events: [],
    });
    const handle = createSessionHandler(dependencies);

    await expect(
      handle("yishan.v1.session.read", { cwd: WORKSPACE_CWD, sessionId: "session-1" }),
    ).rejects.toMatchObject({ code: "YISHAN_SESSION_ID_MISMATCH" });
  });

  it("rejects a read when the persisted session header belongs to another workspace", async () => {
    const dependencies = createDependencies();
    dependencies.sessionQuery.readSession.mockResolvedValue({
      session: { id: "session-1", createdAt: 1, cwd: OTHER_CWD },
      events: [],
    });
    const handle = createSessionHandler(dependencies);

    await expect(
      handle("yishan.v1.session.read", { cwd: WORKSPACE_CWD, sessionId: "session-1" }),
    ).rejects.toBeInstanceOf(YishanSessionWorkspaceMismatchError);
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

  it("rejects extension methods outside the corrected Phase 2 surface", async () => {
    const handle = createSessionHandler(createDependencies());

    await expect(handle("yishan.v1.session.unknown", {})).rejects.toBeInstanceOf(YishanUnsupportedMethodError);
  });
});

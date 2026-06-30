import { describe, expect, it } from "vitest";

import { readWorkspaceCreateFrontendEvent } from "./workspace-create-events";

describe("workspace-create-events", () => {
  it("parses workspace create progress events", () => {
    expect(
      readWorkspaceCreateFrontendEvent({
        type: "event",
        topic: "workspaceCreateProgress",
        payload: {
          workspaceId: " workspace-1 ",
          stepId: " setup ",
          label: " Run setup script ",
          status: "running",
          message: " Installing deps ",
          createdAt: "2026-06-30T00:00:00.000Z",
        },
      }),
    ).toEqual({
      type: "progress",
      workspaceId: "workspace-1",
      stepId: "setup",
      label: "Run setup script",
      status: "running",
      message: "Installing deps",
      createdAt: "2026-06-30T00:00:00.000Z",
    });
  });

  it("parses workspace create completion events", () => {
    expect(
      readWorkspaceCreateFrontendEvent({
        type: "event",
        topic: "workspaceCreateCompleted",
        payload: {
          workspaceId: "workspace-1",
          worktreePath: " /tmp/worktree ",
        },
      }),
    ).toEqual({
      type: "completed",
      workspaceId: "workspace-1",
      worktreePath: "/tmp/worktree",
    });
  });

  it("ignores unrelated or invalid frontend events", () => {
    expect(
      readWorkspaceCreateFrontendEvent({
        type: "event",
        topic: "workspaceSnapshotChanged",
        payload: {
          workspaceId: "workspace-1",
        },
      }),
    ).toBeNull();

    expect(
      readWorkspaceCreateFrontendEvent({
        type: "event",
        topic: "workspaceCreateProgress",
        payload: {
          workspaceId: "workspace-1",
          stepId: "setup",
          label: "Run setup script",
          status: "unknown",
        },
      }),
    ).toBeNull();
  });
});

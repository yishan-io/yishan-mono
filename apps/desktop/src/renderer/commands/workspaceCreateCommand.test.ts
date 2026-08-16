// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueWorkspaceLifecycleWarnings: vi.fn(),
}));

vi.mock("../store/workspaceLifecycleNoticeStore", () => ({
  enqueueWorkspaceLifecycleWarnings: mocks.enqueueWorkspaceLifecycleWarnings,
}));

import { notifyLifecycleScriptWarnings } from "./workspaceCreateCommand";

afterEach(() => {
  vi.clearAllMocks();
});

describe("notifyLifecycleScriptWarnings", () => {
  it("does nothing when warnings are absent", () => {
    notifyLifecycleScriptWarnings("workspace-1", undefined, "setup", "yarn setup");
    notifyLifecycleScriptWarnings("workspace-1", [], "setup", "yarn setup");

    expect(mocks.enqueueWorkspaceLifecycleWarnings).not.toHaveBeenCalled();
  });

  it("normalizes structured warnings and enqueues them", () => {
    notifyLifecycleScriptWarnings(
      "workspace-1",
      [
        {
          scriptKind: "setup",
          timedOut: true,
          message: "setup timed out",
          command: "yarn setup",
          stdoutExcerpt: "out",
          stderrExcerpt: "err",
          exitCode: null,
          signal: null,
          logFilePath: "/tmp/setup.log",
        },
      ],
      "setup",
      "fallback-cmd",
    );

    expect(mocks.enqueueWorkspaceLifecycleWarnings).toHaveBeenCalledWith({
      workspaceName: "workspace-1",
      warnings: [
        {
          scriptKind: "setup",
          timedOut: true,
          message: "setup timed out",
          command: "yarn setup",
          stdoutExcerpt: "out",
          stderrExcerpt: "err",
          exitCode: null,
          signal: null,
          logFilePath: "/tmp/setup.log",
        },
      ],
    });
  });

  it("normalizes legacy plain-string warnings with the fallback kind and command", () => {
    // Runtime accepts legacy plain strings; typed as the structured shape via a cast.
    notifyLifecycleScriptWarnings(
      "workspace-1",
      ["setup script failed"] as unknown as Parameters<typeof notifyLifecycleScriptWarnings>[1],
      "post",
      "fallback-cmd",
    );

    expect(mocks.enqueueWorkspaceLifecycleWarnings).toHaveBeenCalledWith({
      workspaceName: "workspace-1",
      warnings: [
        {
          scriptKind: "post",
          timedOut: false,
          message: "setup script failed",
          command: "fallback-cmd",
          stdoutExcerpt: "",
          stderrExcerpt: "",
          exitCode: null,
          signal: null,
          logFilePath: null,
        },
      ],
    });
  });

  it("fills missing fields on partially structured warnings", () => {
    notifyLifecycleScriptWarnings(
      "workspace-1",
      [
        {
          scriptKind: "setup" as const,
          message: "partial",
          // @ts-expect-error intentionally incomplete record passed through normalization
          command: null,
        },
      ],
      "setup",
      "fallback-cmd",
    );

    expect(mocks.enqueueWorkspaceLifecycleWarnings).toHaveBeenCalledWith({
      workspaceName: "workspace-1",
      warnings: [
        {
          scriptKind: "setup",
          timedOut: false,
          message: "partial",
          command: "fallback-cmd",
          stdoutExcerpt: "",
          stderrExcerpt: "",
          exitCode: null,
          signal: null,
          logFilePath: null,
        },
      ],
    });
  });

  it("maps multiple structured warnings in order", () => {
    notifyLifecycleScriptWarnings(
      "workspace-1",
      [
        {
          scriptKind: "setup",
          timedOut: false,
          message: "first",
          command: "c1",
          stdoutExcerpt: "",
          stderrExcerpt: "",
          exitCode: null,
          signal: null,
          logFilePath: null,
        },
        {
          scriptKind: "setup",
          timedOut: false,
          message: "second",
          command: "c2",
          stdoutExcerpt: "",
          stderrExcerpt: "",
          exitCode: null,
          signal: null,
          logFilePath: null,
        },
      ],
      "setup",
      "fallback-cmd",
    );

    const call = mocks.enqueueWorkspaceLifecycleWarnings.mock.calls[0];
    expect(call?.[0].warnings.map((warning: { message: string }) => warning.message)).toEqual(["first", "second"]);
  });
});

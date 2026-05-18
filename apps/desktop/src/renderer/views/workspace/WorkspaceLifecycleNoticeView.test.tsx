// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  enqueueWorkspaceLifecycleWarnings,
  workspaceLifecycleNoticeStore,
} from "../../store/workspaceLifecycleNoticeStore";
import { WorkspaceLifecycleNoticeView } from "./WorkspaceLifecycleNoticeView";

afterEach(() => {
  workspaceLifecycleNoticeStore.setState(
    {
      noticeQueue: [],
      detailNotice: null,
    },
    false,
  );
});

describe("WorkspaceLifecycleNoticeView", () => {
  it("renders bottom-right snackbar and opens details dialog", async () => {
    enqueueWorkspaceLifecycleWarnings({
      workspaceName: "Feature A",
      warnings: [
        {
          scriptKind: "setup",
          timedOut: false,
          message: "Workspace setup script failed.",
          command: "pnpm install",
          stdoutExcerpt: "stdout sample",
          stderrExcerpt: "stderr sample",
          exitCode: 1,
          signal: null,
          logFilePath: "/tmp/repo/.yishan/logs/workspace-lifecycle/setup.log",
        },
      ],
    });

    render(<WorkspaceLifecycleNoticeView />);

    expect(screen.getByText("Workspace setup script failed")).toBeTruthy();
    expect(screen.getByText("Feature A: Workspace setup script failed.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "View output" }));

    expect(await screen.findByText("Workspace script output")).toBeTruthy();
    expect(screen.getByText("stderr sample")).toBeTruthy();
    expect(screen.getByText("stdout sample")).toBeTruthy();
  });
});

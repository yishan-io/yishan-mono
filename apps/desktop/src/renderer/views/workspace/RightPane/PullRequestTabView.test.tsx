// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspacePullRequestRecord } from "../../../api/types";
import type { DaemonWorkspacePullRequest } from "../../../rpc/daemonTypes";
import { workspaceStore } from "../../../store/workspaceStore";
import { PullRequestTabView } from "./PullRequestTabView";

const mocked = vi.hoisted(() => ({
  openLink: vi.fn(),
  refreshWorkspacePullRequest: vi.fn(),
  state: {
    selectedWorkspaceId: "workspace-1",
    pullRequest: undefined as DaemonWorkspacePullRequest | undefined,
    historicalPullRequests: [] as WorkspacePullRequestRecord[],
    isLoading: false,
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../../commands/appCommands", () => ({
  openLink: (options: { url: string }) => mocked.openLink(options),
}));

vi.mock("../../../hooks/useCommands", () => ({
  useCommands: () => ({
    refreshWorkspacePullRequest: mocked.refreshWorkspacePullRequest,
  }),
}));

vi.mock("./useWorkspacePullRequestState", () => ({
  useWorkspacePullRequestState: () => mocked.state,
}));

const initialWorkspaceStoreState = workspaceStore.getState();

afterEach(() => {
  cleanup();
  workspaceStore.setState(initialWorkspaceStoreState, true);
  mocked.openLink.mockReset();
  mocked.refreshWorkspacePullRequest.mockReset();
  mocked.state.selectedWorkspaceId = "workspace-1";
  mocked.state.pullRequest = undefined;
  mocked.state.historicalPullRequests = [];
  mocked.state.isLoading = false;
});

describe("PullRequestTabView", () => {
  it("renders empty state when no PR exists", () => {
    workspaceStore.setState({
      selectedWorkspaceId: "workspace-1",
      workspaces: [{ id: "workspace-1", worktreePath: "/tmp/workspace-1" } as never],
    });

    render(<PullRequestTabView />);

    expect(screen.getByText("workspace.pr.empty")).toBeTruthy();
    expect(screen.getByRole("button", { name: "workspace.pr.refresh" })).toBeTruthy();
  });

  it("refreshes daemon PR state from the empty state button", () => {
    workspaceStore.setState({
      selectedWorkspaceId: "workspace-1",
      workspaces: [{ id: "workspace-1", worktreePath: "/tmp/workspace-1" } as never],
    });

    render(<PullRequestTabView />);

    fireEvent.click(screen.getByRole("button", { name: "workspace.pr.refresh" }));

    expect(mocked.refreshWorkspacePullRequest).toHaveBeenCalledWith("workspace-1");
  });

  it("renders PR checks and deployments", () => {
    workspaceStore.setState({
      selectedWorkspaceId: "workspace-1",
      workspaces: [{ id: "workspace-1", worktreePath: "/tmp/workspace-1" } as never],
    });
    mocked.state.pullRequest = {
      number: 42,
      title: "Add PR tab",
      status: "review",
      reviewDecision: "APPROVED",
      branch: "feature/pr-tab",
      baseBranch: "main",
      url: "https://github.com/acme/repo/pull/42",
      checks: [
        {
          name: "CI",
          workflow: "build",
          state: "SUCCESS",
          description: "All good",
          url: "https://ci.example.com/run/42",
        },
      ],
      deployments: [
        {
          id: 7,
          environment: "production",
          state: "success",
          description: "Live",
          environmentUrl: "https://prod.example.com",
        },
      ],
    };

    render(<PullRequestTabView />);

    expect(screen.getByText("#42 Add PR tab")).toBeTruthy();
    expect(screen.getByText("workspace.pr.approved")).toBeTruthy();
    expect(screen.getByText("build / CI")).toBeTruthy();
    expect(screen.getByText("production")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "workspace.pr.viewDetails" }));
    expect(mocked.openLink).toHaveBeenCalledWith({ url: "https://github.com/acme/repo/pull/42" });

    fireEvent.click(screen.getByRole("button", { name: "workspace.pr.refresh" }));
    expect(mocked.refreshWorkspacePullRequest).toHaveBeenCalledWith("workspace-1");
  });
});

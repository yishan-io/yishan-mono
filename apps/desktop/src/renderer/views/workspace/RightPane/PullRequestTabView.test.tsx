// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspacePullRequestRecord } from "../../../api/types";
import type { DaemonWorkspacePullRequest } from "../../../rpc/daemonTypes";
import { workspaceStore } from "../../../store/workspaceStore";
import { PullRequestTabView } from "./PullRequestTabView";

const mocked = vi.hoisted(() => ({
  openLink: vi.fn(),
  mergePullRequest: vi.fn(),
  closePullRequest: vi.fn(),
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

vi.mock("../../../commands/gitCommands", () => ({
  mergePullRequest: (options: {
    workspaceId: string;
    prNumber: number;
    method: string;
    deleteBranch: boolean;
  }) => mocked.mergePullRequest(options),
  closePullRequest: (options: { workspaceId: string; prNumber: number }) => mocked.closePullRequest(options),
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

function setupSelectedWorkspace() {
  workspaceStore.setState({
    selectedWorkspaceId: "workspace-1",
    workspaces: [{ id: "workspace-1", worktreePath: "/tmp/workspace-1" } as never],
  });
}

function buildHistoricalPullRequest(
  overrides: Partial<WorkspacePullRequestRecord> & Pick<WorkspacePullRequestRecord, "id" | "prId" | "state">,
): WorkspacePullRequestRecord {
  return {
    id: overrides.id,
    workspaceId: "workspace-1",
    organizationId: "org-1",
    prId: overrides.prId,
    title: overrides.title ?? null,
    url: overrides.url ?? null,
    branch: overrides.branch ?? null,
    baseBranch: overrides.baseBranch ?? null,
    state: overrides.state,
    metadata: overrides.metadata ?? null,
    detectedAt: overrides.detectedAt ?? "2024-01-01T00:00:00.000Z",
    resolvedAt: overrides.resolvedAt ?? null,
    createdAt: overrides.createdAt ?? "2024-01-01T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2024-01-01T00:00:00.000Z",
  };
}

afterEach(() => {
  cleanup();
  workspaceStore.setState(initialWorkspaceStoreState, true);
  mocked.openLink.mockReset();
  mocked.mergePullRequest.mockReset();
  mocked.closePullRequest.mockReset();
  mocked.refreshWorkspacePullRequest.mockReset();
  mocked.state.selectedWorkspaceId = "workspace-1";
  mocked.state.pullRequest = undefined;
  mocked.state.historicalPullRequests = [];
  mocked.state.isLoading = false;
});

describe("PullRequestTabView", () => {
  it("renders empty state when no PR exists", () => {
    setupSelectedWorkspace();

    render(<PullRequestTabView />);

    expect(screen.getByText("workspace.pr.empty")).toBeTruthy();
    expect(screen.getByRole("button", { name: "workspace.pr.refresh" })).toBeTruthy();
  });

  it("refreshes daemon PR state from the empty state button", () => {
    setupSelectedWorkspace();

    render(<PullRequestTabView />);

    fireEvent.click(screen.getByRole("button", { name: "workspace.pr.refresh" }));

    expect(mocked.refreshWorkspacePullRequest).toHaveBeenCalledWith("workspace-1");
  });

  it("renders PR checks and deployments", () => {
    setupSelectedWorkspace();
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

  it("closes the merge method menu after selecting a method", () => {
    setupSelectedWorkspace();
    mocked.state.pullRequest = {
      number: 42,
      title: "Add PR tab",
      status: "open",
      branch: "feature/pr-tab",
      baseBranch: "main",
      url: "https://github.com/acme/repo/pull/42",
      checks: [],
      deployments: [],
    };

    render(<PullRequestTabView />);

    const mergeButton = screen.getByRole("button", { name: "workspace.pr.merge" });
    const mergeMenuButton = mergeButton.parentElement?.querySelectorAll("button")[1];
    expect(mergeMenuButton).toBeTruthy();

    fireEvent.click(mergeMenuButton as HTMLElement);
    expect(screen.getByText("workspace.pr.squashMerge")).toBeTruthy();

    fireEvent.click(screen.getByText("workspace.pr.squashMerge"));

    expect(screen.getByRole("button", { name: "workspace.pr.squash" })).toBeTruthy();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("applies merge results to the original workspace even if selection changes mid-flight", async () => {
    setupSelectedWorkspace();
    workspaceStore.setState({
      ...workspaceStore.getState(),
      workspaces: [
        { id: "workspace-1", worktreePath: "/tmp/workspace-1" } as never,
        { id: "workspace-2", worktreePath: "/tmp/workspace-2" } as never,
      ],
      pullRequestByWorkspaceId: {},
    });
    mocked.state.pullRequest = {
      number: 42,
      title: "Add PR tab",
      status: "open",
      branch: "feature/pr-tab",
      baseBranch: "main",
      url: "https://github.com/acme/repo/pull/42",
      checks: [],
      deployments: [],
    };

    let resolveMerge: (() => void) | undefined;
    mocked.mergePullRequest.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveMerge = resolve;
        }),
    );

    render(<PullRequestTabView />);

    fireEvent.click(screen.getByRole("button", { name: "workspace.pr.merge" }));

    workspaceStore.setState({
      ...workspaceStore.getState(),
      selectedWorkspaceId: "workspace-2",
    });

    await act(async () => {
      resolveMerge?.();
      await Promise.resolve();
    });

    expect(workspaceStore.getState().pullRequestByWorkspaceId["workspace-1"]).toEqual(
      expect.objectContaining({ number: 42, complete: true, status: "merged" }),
    );
    expect(workspaceStore.getState().pullRequestByWorkspaceId["workspace-2"]).toBeUndefined();
  });

  it("renders the open historical PR fallback and past history entries", () => {
    setupSelectedWorkspace();
    mocked.state.historicalPullRequests = [
      buildHistoricalPullRequest({
        id: "history-open",
        prId: "43",
        state: "open",
        title: "Fallback PR",
        url: "https://github.com/acme/repo/pull/43",
        branch: "feature/fallback",
        baseBranch: "main",
      }),
      buildHistoricalPullRequest({
        id: "history-merged",
        prId: "41",
        state: "merged",
        title: "Older merged PR",
        url: "https://github.com/acme/repo/pull/41",
        branch: "feature/older",
        baseBranch: "main",
        resolvedAt: "2024-01-02T00:00:00.000Z",
      }),
    ];

    render(<PullRequestTabView />);

    expect(screen.getByText("#43 Fallback PR")).toBeTruthy();
    expect(screen.getByText("workspace.pr.history")).toBeTruthy();
    expect(screen.getByText("#41 Older merged PR")).toBeTruthy();
  });
});

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { splitPaneStore } from "../../state/splitPaneStore";
import { tabStore } from "../../state/tabStore";
import { WorkspaceSplitPane } from "./WorkspaceSplitPaneView";

vi.mock("./pane/SplitPaneContainer", () => ({
  SplitPaneContainer: ({
    renderPane,
  }: { renderPane: (pane: { id: string; tabIds: string[]; selectedTabId: string }) => ReactNode }) =>
    renderPane({ id: "root-pane", tabIds: ["tab-1"], selectedTabId: "tab-1" }),
}));

vi.mock("./pane/SplitPaneGroup", () => ({
  SplitPaneGroup: (props: {
    onCloseTab: (tabId: string) => void;
    onCloseOtherTabs?: (tabId: string) => void;
    onCloseAllTabs?: (tabId: string) => void;
  }) => (
    <>
      <button type="button" onClick={() => props.onCloseTab("tab-1")}>
        Close
      </button>
      <button type="button" onClick={() => props.onCloseOtherTabs?.("tab-1")}>
        Close Others
      </button>
      <button type="button" onClick={() => props.onCloseAllTabs?.("tab-1")}>
        Close All
      </button>
    </>
  ),
}));

vi.mock("./WorkspaceTabSurfaceLayer", () => ({ WorkspaceTabSurfaceLayer: () => null }));
vi.mock("./useOpenTabAutoRefresh", () => ({ useOpenTabAutoRefresh: () => undefined }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const initialSplitPaneState = splitPaneStore.getState();
const initialTabStoreState = tabStore.getState();

afterEach(() => {
  cleanup();
  splitPaneStore.setState(initialSplitPaneState, true);
  tabStore.setState(initialTabStoreState, true);
});

describe("WorkspaceSplitPane close wiring", () => {
  it("opens a selected DSH history session with its runtime instead of resuming an equal Pi id", () => {
    const findTabWithSession = vi.fn(() => undefined);
    let selectSession:
      | ((session: { sessionId: string; cwd?: string | null; runtime: "pi" | "dsh" }, title: string) => void)
      | undefined;
    splitPaneStore.setState({
      layoutByWorkspaceId: {
        "workspace-1": {
          root: { kind: "leaf", id: "root-pane", tabIds: ["pi-tab"], selectedTabId: "pi-tab" },
          activePaneId: "root-pane",
        },
      },
    });
    tabStore.setState({
      selectedTabId: "pi-tab",
      tabs: [
        {
          id: "pi-tab",
          workspaceId: "workspace-1",
          title: "Pi",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/tmp/workspace", sessionId: "same-id", runtime: "pi" },
        },
      ],
    });

    render(
      <WorkspaceSplitPane
        workspaceId="workspace-1"
        isActive
        workspaceTabs={tabStore.getState().tabs}
        worktreePath="/tmp/workspace"
        enabledAgentKinds={[]}
        agentPresetMeta={{}}
        tabFileCommands={{ createNewWhiteboard: vi.fn(), renameEntry: vi.fn() }}
        openTabRefreshCommands={{
          readFile: vi.fn(),
          readDiff: vi.fn(),
          readCommitDiff: vi.fn(),
          readBranchComparisonDiff: vi.fn(),
          refreshFileTabFromDisk: vi.fn(),
          refreshDiffTabContent: vi.fn(),
        }}
        renderSessionHistoryMenu={({ onSelectSession }) => {
          selectSession = onSelectSession;
          return null;
        }}
        lastUsedExternalAppId={undefined}
        findTabWithSession={findTabWithSession}
        formatAgentSessionTitle={(title) => title}
        renderTabContent={() => null}
        renderAgentChatSurface={() => null}
        closeTabWithCleanup={vi.fn()}
        closeOtherTabsWithCleanup={vi.fn()}
        closeAllTabsWithCleanup={vi.fn()}
      />,
    );

    selectSession?.({ sessionId: "same-id", cwd: "/tmp/workspace", runtime: "dsh" }, "DSH history");

    expect(findTabWithSession).toHaveBeenCalledWith("same-id", "dsh");
    expect(tabStore.getState().tabs).toContainEqual(
      expect.objectContaining({
        kind: "agent-chat",
        data: expect.objectContaining({ sessionId: "same-id", runtime: "dsh" }),
      }),
    );
  });

  it("routes tab-bar close actions to the App cleanup commands", () => {
    const closeTabWithCleanup = vi.fn();
    const closeOtherTabsWithCleanup = vi.fn();
    const closeAllTabsWithCleanup = vi.fn();
    splitPaneStore.setState({
      layoutByWorkspaceId: {
        "workspace-1": {
          root: { kind: "leaf", id: "root-pane", tabIds: ["tab-1"], selectedTabId: "tab-1" },
          activePaneId: "root-pane",
        },
      },
    });
    tabStore.setState({ selectedTabId: "tab-1" });

    render(
      <WorkspaceSplitPane
        workspaceId="workspace-1"
        isActive
        workspaceTabs={[
          { id: "tab-1", workspaceId: "workspace-1", title: "Tab", pinned: false, kind: "browser", data: { url: "" } },
        ]}
        worktreePath="/tmp/workspace"
        enabledAgentKinds={[]}
        agentPresetMeta={{}}
        tabFileCommands={{ createNewWhiteboard: vi.fn(), renameEntry: vi.fn() }}
        openTabRefreshCommands={{
          readFile: vi.fn(),
          readDiff: vi.fn(),
          readCommitDiff: vi.fn(),
          readBranchComparisonDiff: vi.fn(),
          refreshFileTabFromDisk: vi.fn(),
          refreshDiffTabContent: vi.fn(),
        }}
        lastUsedExternalAppId={undefined}
        findTabWithSession={vi.fn()}
        formatAgentSessionTitle={(title) => title}
        renderTabContent={() => null}
        renderAgentChatSurface={() => null}
        closeTabWithCleanup={closeTabWithCleanup}
        closeOtherTabsWithCleanup={closeOtherTabsWithCleanup}
        closeAllTabsWithCleanup={closeAllTabsWithCleanup}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "Close Others" }));
    fireEvent.click(screen.getByRole("button", { name: "Close All" }));

    expect(closeTabWithCleanup).toHaveBeenCalledWith("tab-1", undefined);
    expect(closeOtherTabsWithCleanup).toHaveBeenCalledWith("tab-1");
    expect(closeAllTabsWithCleanup).toHaveBeenCalledWith("tab-1");
  });
});

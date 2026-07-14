// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LaunchView } from "./LaunchView";

const mocks = vi.hoisted(() => ({
  openTab: vi.fn(),
  openWorkspaceFileSearch: vi.fn(),
  workspaces: [] as Array<{ id: string; status?: "active" | "closed" | "provisioning" }>,
  progressByWorkspaceId: {} as Record<string, unknown>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "launch.title": "No tabs open",
        "launch.hint": "Select an action to get started.",
        "launch.actions.openTerminal": "Open terminal",
        "launch.actions.openBrowser": "Open browser tab",
        "launch.actions.searchFiles": "Search files",
        "terminal.title": "Terminal",
      };

      return translations[key] ?? key;
    },
  }),
}));

vi.mock("../../hooks/useCommands", () => ({
  useCommands: () => ({
    openTab: mocks.openTab,
    openWorkspaceFileSearch: mocks.openWorkspaceFileSearch,
  }),
}));

vi.mock("../../helpers/platform", () => ({
  getRendererPlatform: () => "darwin",
}));

vi.mock("../../shortcuts/shortcutDisplay", () => ({
  getShortcutDisplayLabelById: (id: string) => {
    if (id === "open-terminal") {
      return "⌘+T";
    }
    if (id === "open-file-search") {
      return "⌘+P";
    }
    if (id === "open-browser") {
      return "⌘+⇧+B";
    }

    return null;
  },
}));

vi.mock("../../store/workspaceCreateProgressStore", () => ({
  workspaceCreateProgressStore: (selector: (state: { progressByWorkspaceId: Record<string, unknown> }) => unknown) =>
    selector({ progressByWorkspaceId: mocks.progressByWorkspaceId }),
}));

vi.mock("../../store/workspaceStore", () => ({
  workspaceStore: (selector: (state: { workspaces: Array<{ id: string; status?: string }> }) => unknown) =>
    selector({ workspaces: mocks.workspaces }),
}));

vi.mock("../../store/settings/agentSettingsStore", () => ({
  agentSettingsStore: (selector: (state: { customCommandByAgentKind: Record<string, unknown> }) => unknown) =>
    selector({ customCommandByAgentKind: {} }),
}));

describe("LaunchView", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    mocks.workspaces = [];
    mocks.progressByWorkspaceId = {};
  });

  it("shows shortcut labels for launch actions", () => {
    render(<LaunchView workspaceId="workspace-1" enabledAgentKinds={[]} />);

    expect(screen.getByText("⌘+T")).toBeTruthy();
    expect(screen.getByText("⌘+P")).toBeTruthy();
    expect(screen.getByText("⌘+⇧+B")).toBeTruthy();
  });

  it("runs launch actions when clicked", () => {
    render(<LaunchView workspaceId="workspace-1" enabledAgentKinds={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Open terminal" }));
    fireEvent.click(screen.getByRole("button", { name: "Open browser tab" }));
    fireEvent.click(screen.getByRole("button", { name: "Search files" }));

    expect(mocks.openTab).toHaveBeenCalledTimes(2);
    expect(mocks.openWorkspaceFileSearch).toHaveBeenCalledTimes(1);
  });

  it("does not show progress detail for active workspaces with stale progress entries", () => {
    mocks.workspaces = [{ id: "workspace-1", status: "active" }];
    mocks.progressByWorkspaceId = {
      "workspace-1": {
        workspaceId: "workspace-1",
        isComplete: false,
        updatedAt: "2026-07-01T00:00:00.000Z",
        steps: [{ id: "worktree", label: "Fetch & create worktree", status: "running" }],
      },
    };

    render(<LaunchView workspaceId="workspace-1" enabledAgentKinds={[]} />);

    expect(screen.queryByText("You can follow setup progress here while the daemon finishes provisioning.")).toBeNull();
    expect(screen.getByRole("button", { name: "Open terminal" })).toBeTruthy();
  });

  it("does not apply the AI Chat default model to terminal Pi launches", () => {
    render(<LaunchView workspaceId="workspace-1" enabledAgentKinds={["pi"]} />);

    fireEvent.click(screen.getByRole("button", { name: "tabs.createMenu.pi" }));

    expect(mocks.openTab).toHaveBeenCalledWith(
      expect.objectContaining({
        agentKind: "pi",
        launchCommand: "pi",
      }),
    );
  });
});

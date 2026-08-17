// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectStore } from "../../../features/project/state/projectStore";
import { sessionStore } from "../../../features/session/state/sessionStore";
import { workspaceStore } from "../../../features/workspace/state/workspaceStore";
import { CreateScheduledJobFormView } from "./CreateScheduledJobFormView";

const mocked = vi.hoisted(() => ({
  createScheduledJob: vi.fn(),
  listNodesByOrg: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { value?: string }) => (options?.value ? `${key}:${options.value}` : key),
  }),
}));

vi.mock("../../../app/commands/useCommands", () => {
  const commandSurface = () => ({

    createScheduledJob: mocked.createScheduledJob,
  });
  return {
    useAppCommands: commandSurface,
    useSessionCommands: commandSurface,
    useWorkspaceCommands: commandSurface,
    useAgentCommands: commandSurface,
    useGitCommands: commandSurface,
    useNodeCommands: commandSurface,
    useNotificationCommands: commandSurface,
    useOrganizationCommands: commandSurface,
    useOverviewCommands: commandSurface,
    useScheduledJobCommands: commandSurface,
    useFileCommands: commandSurface,
    useProjectCommands: commandSurface,
    useWorkbenchCommands: commandSurface,
    useTerminalCommands: commandSurface,
    useSettingsCommands: commandSurface,
  };
});


vi.mock("../../../api", () => ({
  api: {
    node: {
      listByOrg: mocked.listNodesByOrg,
    },
  },
}));

const initialSessionState = sessionStore.getState();
const initialWorkspaceState = workspaceStore.getState();

function renderCreateScheduledJobFormView() {
  const queryClient = new QueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <CreateScheduledJobFormView onCreated={() => {}} />
    </QueryClientProvider>,
  );
}

describe("CreateScheduledJobFormView", () => {
  afterEach(() => {
    sessionStore.setState(initialSessionState, true);
    workspaceStore.setState(initialWorkspaceState, true);
    cleanup();
    vi.clearAllMocks();
  });

  it("submits with the selected project default and daemon node default", async () => {
    sessionStore.setState({ selectedOrganizationId: "org-1", daemonId: "node-daemon" });
    workspaceStore.setState({
      selectedProjectId: "project-2",
      projects: [
        {
          id: "project-1",
          name: "Alpha",
          icon: "terminal",
          color: "#111111",
        },
        {
          id: "project-2",
          name: "Beta",
          icon: "terminal",
          color: "#222222",
        },
      ],
    });
    projectStore.setState({
      projects: [
        {
          id: "project-1",
          name: "Alpha",
          icon: "terminal",
          color: "#111111",
        },
        {
          id: "project-2",
          name: "Beta",
          icon: "terminal",
          color: "#222222",
        },
      ],
    });
    mocked.listNodesByOrg.mockResolvedValueOnce([
      {
        id: "node-daemon",
        name: "Local daemon",
        kind: "managed",
        scope: "private",
        endpoint: null,
        metadata: null,
        ownerUserId: "user-1",
        organizationId: "org-1",
        canUse: true,
        createdByUserId: "user-1",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
        isOnline: true,
      },
    ]);

    renderCreateScheduledJobFormView();

    await waitFor(() => {
      expect(mocked.listNodesByOrg).toHaveBeenCalledWith("org-1");
    });

    fireEvent.change(screen.getByPlaceholderText("scheduledJob.form.namePlaceholder"), {
      target: { value: "Morning summary" },
    });
    fireEvent.change(screen.getByPlaceholderText("scheduledJob.form.promptPlaceholder"), {
      target: { value: "Summarize project status" },
    });
    fireEvent.click(screen.getByRole("button", { name: "scheduledJob.form.submit" }));

    await waitFor(() => {
      expect(mocked.createScheduledJob).toHaveBeenCalledWith({
        name: "Morning summary",
        projectId: "project-2",
        nodeId: "node-daemon",
        agentKind: "pi",
        cronExpression: "0 9 * * 1-5",
        prompt: "Summarize project status",
        timezone: "UTC",
      });
    });

    expect(screen.getByText(/^scheduledJob.form.nextRunEstimate:/)).toBeTruthy();
  });
});

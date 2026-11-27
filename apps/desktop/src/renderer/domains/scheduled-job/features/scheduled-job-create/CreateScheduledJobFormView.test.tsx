// @vitest-environment jsdom

import { workbenchNavigationStore } from "@renderer/domains/workbench";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { projectStore } from "../../../../domains/project/state/projectStore";
import { sessionStore } from "../../../../domains/session/state/sessionStore";
import { workspaceStore } from "../../../../domains/workspace/state/workspaceStore";
import { CreateScheduledJobFormView } from "./CreateScheduledJobFormView";

const mocked = vi.hoisted(() => ({
  createScheduledJob: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string, options?: { value?: string }) => (options?.value ? `${key}:${options.value}` : key),
  }),
}));

vi.mock("../../commands/scheduledJobCommands", () => ({
  createScheduledJob: mocked.createScheduledJob,
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

  it("submits with the selected project default on this daemon's node", async () => {
    sessionStore.setState({ selectedOrganizationId: "org-1", daemonId: "node-daemon" });
    workbenchNavigationStore.setState({
      activeProjectId: "project-2",
    });
    workspaceStore.setState({});
    projectStore.setState({});
    renderCreateScheduledJobFormView();

    // Jobs always run on this machine, so there is no node picker.
    expect(screen.queryByText("scheduledJob.form.node")).toBeNull();

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

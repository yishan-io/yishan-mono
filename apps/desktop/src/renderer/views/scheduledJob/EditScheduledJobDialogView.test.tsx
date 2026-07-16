// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScheduledJobRecord } from "../../api/scheduledJobApi";
import { sessionStore } from "../../store/sessionStore";
import { workspaceStore } from "../../store/workspaceStore";
import { EditScheduledJobDialogView } from "./EditScheduledJobDialogView";

const mocked = vi.hoisted(() => ({
  listNodesByOrg: vi.fn(),
  updateScheduledJob: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { value?: string }) => (options?.value ? `${key}:${options.value}` : key),
  }),
}));

vi.mock("../../hooks/useCommands", () => ({
  useCommands: () => ({
    updateScheduledJob: mocked.updateScheduledJob,
  }),
}));

vi.mock("../../hooks/useDialogRegistration", () => ({
  useDialogRegistration: () => {},
}));

vi.mock("../../api", () => ({
  api: {
    node: {
      listByOrg: mocked.listNodesByOrg,
    },
  },
}));

const initialSessionState = sessionStore.getState();
const initialWorkspaceState = workspaceStore.getState();

const baseJob: ScheduledJobRecord = {
  id: "job-1",
  organizationId: "org-1",
  projectId: "project-1",
  nodeId: "node-2",
  name: "Tuesday digest",
  agentKind: "opencode",
  prompt: "Prepare the digest",
  model: null,
  command: null,
  cronExpression: "30 14 * * 2",
  timezone: "UTC",
  status: "active",
  nextRunAt: "2024-01-02T14:30:00.000Z",
  lastScheduledFor: null,
  lastRunAt: null,
  lastRunStatus: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  createdByUserId: "user-1",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

function renderEditScheduledJobDialogView(job: ScheduledJobRecord = baseJob) {
  const queryClient = new QueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <EditScheduledJobDialogView job={job} open onClose={() => {}} />
    </QueryClientProvider>,
  );
}

describe("EditScheduledJobDialogView", () => {
  afterEach(() => {
    sessionStore.setState(initialSessionState, true);
    workspaceStore.setState(initialWorkspaceState, true);
    cleanup();
    vi.clearAllMocks();
  });

  it("submits the existing editable defaults for the current job", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    sessionStore.setState({ selectedOrganizationId: "org-1" });
    workspaceStore.setState({
      projects: [{ id: "project-1", name: "Alpha", icon: "terminal", color: "#111111" }],
    });
    mocked.listNodesByOrg.mockResolvedValueOnce([
      {
        id: "node-2",
        name: "Shared node",
        kind: "managed",
        scope: "shared",
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

    renderEditScheduledJobDialogView();

    await waitFor(() => {
      expect(mocked.listNodesByOrg).toHaveBeenCalledWith("org-1");
    });

    fireEvent.click(screen.getByRole("button", { name: "scheduledJob.edit.save" }));

    await waitFor(() => {
      expect(mocked.updateScheduledJob).toHaveBeenCalledWith("job-1", {
        name: "Tuesday digest",
        nodeId: "node-2",
        agentKind: "opencode",
        cronExpression: "30 14 * * 2",
        timezone: "UTC",
        prompt: "Prepare the digest",
      });
    });

    expect(screen.getByText(/^scheduledJob.form.nextRunEstimate:/)).toBeTruthy();
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(expect.stringContaining("out-of-range value"));
    consoleErrorSpy.mockRestore();
  });
});

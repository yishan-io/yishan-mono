// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScheduledJobRecord } from "../../api/scheduledJobApi";
import { scheduledJobStore } from "../../store/scheduledJobStore";
import { workspaceStore } from "../../store/workspaceStore";
import { ScheduledJobListItemView } from "./ScheduledJobListItemView";

vi.mock("@mui/material", async (importOriginal) => {
  const material = await importOriginal<typeof import("@mui/material")>();

  return {
    ...material,
    Tooltip: ({ title, children }: { title: string; children: React.ReactNode }) => (
      <span data-testid="tooltip" data-title={title}>
        {children}
      </span>
    ),
  };
});

const mocked = vi.hoisted(() => ({
  pauseScheduledJob: vi.fn(),
  resumeScheduledJob: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../hooks/useCommands", () => ({
  useCommands: () => mocked,
}));

vi.mock("./ScheduledJobRunStatusIcon", () => ({
  ScheduledJobRunStatusIcon: ({ status, size }: { status: string; size: number }) => (
    <span data-testid="scheduled-job-run-status-icon" data-size={size} data-status={status} />
  ),
}));

const initialScheduledJobState = scheduledJobStore.getState();
const initialWorkspaceState = workspaceStore.getState();

const job: ScheduledJobRecord = {
  id: "job-1",
  organizationId: "org-1",
  projectId: "project-1",
  nodeId: "node-1",
  name: "Nightly digest",
  agentKind: "unknown-agent",
  prompt: "Send digest",
  model: null,
  command: null,
  cronExpression: "0 0 * * *",
  timezone: "UTC",
  status: "active",
  nextRunAt: "2026-07-23T00:00:00.000Z",
  lastScheduledFor: "2026-07-22T00:00:00.000Z",
  lastRunAt: "2026-07-22T00:01:00.000Z",
  lastRunStatus: "succeeded",
  lastErrorCode: null,
  lastErrorMessage: null,
  createdByUserId: "user-1",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

afterEach(() => {
  scheduledJobStore.setState(initialScheduledJobState, true);
  workspaceStore.setState(initialWorkspaceState, true);
  cleanup();
  vi.clearAllMocks();
});

describe("ScheduledJobListItemView", () => {
  it("wraps a non-null last-run 14px icon in its translated caller-owned tooltip", async () => {
    scheduledJobStore.setState({ pendingActionIds: [] });
    workspaceStore.setState({ projects: [] });

    render(
      <table>
        <tbody>
          <ScheduledJobListItemView job={job} />
        </tbody>
      </table>,
    );

    const icon = screen.getByTestId("scheduled-job-run-status-icon");
    expect(icon.getAttribute("data-size")).toBe("14");
    expect(icon.getAttribute("data-status")).toBe("succeeded");

    expect(icon.closest("[data-testid='tooltip']")?.getAttribute("data-testid")).toBe("tooltip");
    expect(icon.closest("[data-testid='tooltip']")?.getAttribute("data-title")).toBe("scheduledJob.lastRun.succeeded");
  });
});

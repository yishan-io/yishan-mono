// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScheduledJobRecord, ScheduledJobRunRecord } from "../../api/scheduledJobApi";
import { ScheduledJobRunsSidebar } from "./ScheduledJobRunsSidebar";

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
  listRuns: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../api", () => ({
  api: {
    scheduledJob: {
      listRuns: mocked.listRuns,
    },
  },
}));

vi.mock("./ScheduledJobRunStatusIcon", () => ({
  ScheduledJobRunStatusIcon: ({ status, size }: { status: string; size: number }) => (
    <span data-testid="scheduled-job-run-status-icon" data-size={size} data-status={status} />
  ),
}));

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
  lastScheduledFor: null,
  lastRunAt: null,
  lastRunStatus: null,
  lastErrorCode: null,
  lastErrorMessage: null,
  createdByUserId: "user-1",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

const run: ScheduledJobRunRecord = {
  id: "run-1",
  jobId: "job-1",
  organizationId: "org-1",
  projectId: "project-1",
  nodeId: "node-1",
  scheduledFor: "2026-07-22T00:00:00.000Z",
  startedAt: "2026-07-22T00:00:01.000Z",
  finishedAt: "2026-07-22T00:00:02.000Z",
  status: "failed",
  responseBody: null,
  errorCode: null,
  errorMessage: null,
  errorDetails: null,
  createdAt: "2026-07-22T00:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ScheduledJobRunsSidebar", () => {
  it("shows the translated run label beside a 13px icon without a status tooltip", async () => {
    mocked.listRuns.mockResolvedValueOnce([run]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <ScheduledJobRunsSidebar orgId="org-1" job={job} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("scheduledJob.runs.status.failed")).toBeTruthy();
    const icon = screen.getByTestId("scheduled-job-run-status-icon");
    expect(icon.getAttribute("data-size")).toBe("13");
    expect(icon.closest("[data-testid='tooltip']")).toBeNull();
  });
});

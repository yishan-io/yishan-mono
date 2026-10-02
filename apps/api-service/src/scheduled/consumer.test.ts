import { afterEach, describe, expect, it, vi } from "vitest";

import { handleDispatchMessage } from "@/scheduled/consumer";
import type { DispatchMessage } from "@/scheduled/queue";
import type { JobEvaluatorService } from "@/services/job-evaluator-service";

const MESSAGE: DispatchMessage = {
  runId: "run-1",
  jobId: "job-1",
  nodeId: "node-1",
  projectId: "project-1",
  agentKind: "pi",
  prompt: "Review the project",
  model: "model-1",
  command: "review",
  scheduledFor: "2026-06-16T00:00:00.000Z",
};

type Trigger = "manual" | "schedule";

function createJobEvaluatorService(trigger: Trigger) {
  return {
    getPendingRunForDispatch: vi.fn().mockResolvedValue({ runId: MESSAGE.runId, trigger }),
    findProjectPathForNode: vi.fn().mockResolvedValue("/project"),
    markRunSkippedOffline: vi.fn().mockResolvedValue(undefined),
  } as unknown as JobEvaluatorService;
}

function stubSuccessfulRelayFetch() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: vi.fn().mockResolvedValue({ ok: true }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("handleDispatchMessage", () => {
  it("dispatches pending manual runs through Relay", async () => {
    const service = createJobEvaluatorService("manual");
    const fetchMock = stubSuccessfulRelayFetch();

    await handleDispatchMessage(service, { RELAY_URL: "https://relay.test" }, MESSAGE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never dispatches pending scheduled runs through Relay", async () => {
    const service = createJobEvaluatorService("schedule");
    const fetchMock = stubSuccessfulRelayFetch();

    await handleDispatchMessage(service, { RELAY_URL: "https://relay.test" }, MESSAGE);

    expect(service.findProjectPathForNode).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

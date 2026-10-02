import { afterEach, describe, expect, it, vi } from "vitest";

import { RelayEventService } from "@/services/relay-event-service";
import type { ServiceConfig } from "@/types";

const config = {
  relayUrl: "https://relay.example",
  relayApiToken: "relay-token",
} as ServiceConfig;

describe("RelayEventService", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("publishes targeted scheduled-job changes without payload contents", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const service = new RelayEventService(config);

    await service.publishScheduledJobScheduleChanged("node-1");

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/api/v1/node-events", config.relayUrl),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer relay-token" }),
        body: JSON.stringify({ nodeId: "node-1", method: "job.schedule.changed" }),
      }),
    );
  });

  it("uses the injected timeout signal and handles an aborted relay request", async () => {
    const abortController = new AbortController();
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const service = new RelayEventService(config, () => abortController.signal);

    const publishPromise = service.publishWorkspaceSnapshotChanged({
      organizationId: "org-1",
      resource: "project",
      change: "created",
      projectId: "project-1",
    });
    abortController.abort();

    await expect(publishPromise).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL("/api/v1/org-events", config.relayUrl),
      expect.objectContaining({ signal: abortController.signal }),
    );
    expect(consoleWarn).toHaveBeenCalledWith(
      "[RelayEventService] Relay event publish failed",
      expect.objectContaining({ name: "AbortError" }),
    );
  });
});

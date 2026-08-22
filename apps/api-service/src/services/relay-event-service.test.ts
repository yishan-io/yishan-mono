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

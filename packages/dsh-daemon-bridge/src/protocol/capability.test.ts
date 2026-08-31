import { describe, expect, it } from "vitest";

import { MAX_REQUEST_LIFETIME_MS, parseCapabilityRequest } from "./capability";

const NOW_MS = 1_000_000;

describe("parseCapabilityRequest", () => {
  const request = {
    id: "request-1",
    cancellationId: "cancel-1",
    sessionId: "session-1",
    workspaceId: "workspace-1",
    generation: 2,
    deadlineAtMs: NOW_MS + 10_000,
    operation: "workspace.readFile",
    input: { path: "README.md" },
  };

  it("requires session, workspace, cancellation, and deadline authority context", () => {
    expect(parseCapabilityRequest(request, NOW_MS)).toMatchObject({
      operation: "workspace.readFile",
      generation: 2,
      cancellationId: "cancel-1",
    });
  });

  it("rejects expired or unbounded deadlines", () => {
    expect(() => parseCapabilityRequest({ ...request, deadlineAtMs: NOW_MS }, NOW_MS)).toThrow(
      "allowed request lifetime",
    );
    expect(() =>
      parseCapabilityRequest({ ...request, deadlineAtMs: NOW_MS + MAX_REQUEST_LIFETIME_MS + 1 }, NOW_MS),
    ).toThrow("allowed request lifetime");
  });

  it("accepts and strips unknown fields for forward-compatible wire messages", () => {
    expect(parseCapabilityRequest({ ...request, cwd: "/untrusted" }, NOW_MS)).not.toHaveProperty("cwd");
  });
});

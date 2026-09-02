import { describe, expect, it } from "vitest";

import { parseInteractionRequest } from "./request";

const NOW_MS = 1_000_000;
const request = {
  id: "approval-1",
  cancellationId: "cancel-1",
  sessionId: "session-1",
  workspaceId: "workspace-1",
  generation: 2,
  kind: "approval",
  prompt: "Allow command?",
  choices: ["allow-once", "deny"],
  deadlineAtMs: NOW_MS + 10_000,
};

describe("parseInteractionRequest", () => {
  it("accepts a correlated approval request", () => {
    expect(parseInteractionRequest(request, NOW_MS)).toMatchObject({ kind: "approval", deadlineAtMs: NOW_MS + 10_000 });
  });

  it("rejects unsupported interaction kinds", () => {
    expect(() => parseInteractionRequest({ ...request, kind: "unknown" }, NOW_MS)).toThrow(
      "unsupported interaction kind",
    );
  });

  it("accepts and strips unknown fields for forward-compatible wire messages", () => {
    expect(parseInteractionRequest({ ...request, trusted: true }, NOW_MS)).not.toHaveProperty("trusted");
  });
});

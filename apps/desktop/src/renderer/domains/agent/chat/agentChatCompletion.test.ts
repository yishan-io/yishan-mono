import { describe, expect, it } from "vitest";
import { normalizeIncomingAgentMessage } from "../subscriptions/agentChatInboundMessage";
import { projectSubagentCompletion } from "./agentChatCompletion";
import type { AgentMessage } from "./agentChatTypes";

const details = { version: 1, agentId: "run-1", agentName: "code-reviewer", status: "completed", sessionId: "child-1" };
const message: AgentMessage = {
  id: "notice-1",
  role: "custom",
  customType: "subagent-completion",
  display: true,
  content: "Untrusted prose: sessionId=wrong-session /private/result.txt",
  details,
};

describe("projectSubagentCompletion", () => {
  it.each(["completed", "failed", "cancelled"])("projects %s using details only, without usage", (status) => {
    expect(projectSubagentCompletion({ ...message, details: { ...details, status, usage: { total: 999 } } })).toEqual({
      agentId: "run-1",
      agentName: "code-reviewer",
      status,
      sessionId: "child-1",
    });
  });

  it("allows an absent optional session ID without inventing one from content or agent ID", () => {
    const { sessionId: _sessionId, ...withoutSession } = details;
    expect(projectSubagentCompletion({ ...message, details: withoutSession })).toEqual({
      agentId: "run-1",
      agentName: "code-reviewer",
      status: "completed",
    });
  });

  it.each([
    { role: "assistant" as const },
    { customType: "unknown" },
    { display: false },
    { display: undefined },
    { details: undefined },
    { details: {} },
    { details: { ...details, version: 2 } },
    { details: { ...details, version: "1" } },
    { details: { ...details, agentId: "" } },
    { details: { ...details, agentId: "  " } },
    { details: { ...details, agentId: 123 } },
    { details: { ...details, agentId: " run-1 " } },
    { details: { ...details, agentName: " " } },
    { details: { ...details, agentName: null } },
    { details: { ...details, status: "running" } },
    { details: { ...details, status: "canceled" } },
    { details: { ...details, sessionId: "" } },
    { details: { ...details, sessionId: "  " } },
    { details: { ...details, sessionId: " child-1 " } },
    { details: { ...details, sessionId: 123 } },
    { details: { ...details, sessionId: null } },
  ])("hides invalid/hidden messages safely: %j", (overrides) => {
    expect(projectSubagentCompletion({ ...message, ...overrides })).toBeNull();
  });

  it("preserves the v1 details contract through inbound normalization for live and history messages", () => {
    const normalized = normalizeIncomingAgentMessage(message);
    expect(normalized?.details).toEqual(details);
    expect(normalized && projectSubagentCompletion(normalized)).toEqual(projectSubagentCompletion(message));
  });
});

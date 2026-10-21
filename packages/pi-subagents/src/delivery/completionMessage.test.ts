import { describe, expect, it } from "vitest";
import { type AgentResult, emptyAgentUsageStats } from "../delegation/types";
import { buildCompletionMessage } from "./completionMessage";

function result(overrides: Partial<AgentResult> = {}): AgentResult {
  return {
    agentId: "one",
    agentName: "Explore",
    status: "completed",
    responseText: "findings",
    usage: emptyAgentUsageStats,
    ...overrides,
  };
}

describe("completion message", () => {
  it.each(["completed", "failed", "cancelled"] as const)("includes versioned identity details for %s", (status) => {
    const message = buildCompletionMessage(
      result({
        status,
        sessionId: "child-session-one",
        responseText: "Sub-agent other (Wrong): failed",
        error: status === "failed" ? "failure" : undefined,
      }),
    );
    expect(message).toEqual({
      customType: "subagent-completion",
      display: true,
      content: expect.any(String),
      details: { version: 1, agentId: "one", agentName: "Explore", status, sessionId: "child-session-one" },
    });
    expect(message).not.toHaveProperty("usage");
    expect(message.details).not.toHaveProperty("usage");
  });

  it("omits absent child session identity even when a transcript path exists", () => {
    const message = buildCompletionMessage(result({ sessionPath: "/tmp/one.jsonl" }));
    expect(message.details).toEqual({ version: 1, agentId: "one", agentName: "Explore", status: "completed" });
    expect(message.details).not.toHaveProperty("sessionId");
  });
  it.each(["output", "error"])("retains a readable transcript path outside truncated %s", (field) => {
    const sessionPath = "/tmp/child sessions/one.jsonl";
    const message = buildCompletionMessage(
      result({
        status: "failed",
        sessionPath,
        error: field === "error" ? "failure".repeat(10000) : "failure",
        responseText: "output".repeat(10000),
      }),
    );
    expect(message.content.length).toBeLessThanOrEqual(50000);
    expect(message.content).toContain("[Result truncated]");
    expect(message.content.slice(message.content.indexOf("[Result truncated]"))).toContain(sessionPath);
    expect(message.content.indexOf("failure")).toBeLessThan(
      message.content.indexOf("output") < 0 ? 50000 : message.content.indexOf("output"),
    );
    expect(message.content).not.toContain("/agent-result");
    expect(message).toEqual({
      customType: "subagent-completion",
      display: true,
      content: expect.any(String),
      details: { version: 1, agentId: "one", agentName: "Explore", status: "failed" },
    });
  });

  it("includes short output and transcript reference without truncation", () => {
    const message = buildCompletionMessage(result({ sessionPath: "/tmp/one.jsonl" }));
    expect(message.content).toContain("findings");
    expect(message.content).toContain("/tmp/one.jsonl");
    expect(message.content).not.toContain("truncated");
  });

  it("reports unavailable transcripts and preserves cancellation with no usage payload", () => {
    const message = buildCompletionMessage(
      result({ status: "cancelled", cancellationOrigin: "user", responseText: "" }),
    );
    expect(message.content).toContain("cancelled");
    expect(message.content).toContain("Cancellation: user");
    expect(message.content).toContain("(no output)");
    expect(message.content).toContain("Child transcript: unavailable");
    expect(message.details).toEqual({ version: 1, agentId: "one", agentName: "Explore", status: "cancelled" });
    expect(message).not.toHaveProperty("usage");
    expect(message.details).not.toHaveProperty("usage");
  });
});

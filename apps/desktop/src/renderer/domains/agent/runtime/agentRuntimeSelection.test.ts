import { describe, expect, it } from "vitest";
import { normalizeAgentChatRuntime, selectNewAgentChatRuntime } from "./agentRuntimeSelection";

describe("agent runtime selection", () => {
  it.each([
    [{ configured: false, ready: true, transcriptProtocolVersion: 2 }, "pi"],
    [{ configured: true, ready: false, transcriptProtocolVersion: 2 }, "pi"],
    [{ configured: true, ready: true, transcriptProtocolVersion: 2 }, "dsh"],
  ] as const)("selects %s capability as %s for a new top-level tab", (dsh, runtime) => {
    expect(selectNewAgentChatRuntime({ dsh })).toBe(runtime);
  });

  it("normalizes legacy and explicit session tabs to Pi while retaining explicit runtimes", () => {
    expect(normalizeAgentChatRuntime({})).toBe("pi");
    expect(normalizeAgentChatRuntime({ sessionId: "legacy-session" })).toBe("pi");
    expect(normalizeAgentChatRuntime({ sessionId: "dsh-session", runtime: "dsh" })).toBe("dsh");
    expect(normalizeAgentChatRuntime({ runtime: "pi" })).toBe("pi");
  });
});

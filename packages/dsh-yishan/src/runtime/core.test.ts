import { describe, expect, it } from "vitest";

import { YISHAN_AGENT_SPINE_CONFIG, YISHAN_RUNTIME_MCP_ENABLED } from "./core";

describe("runtime core services", () => {
  it("enables all built-in agent-spine capabilities without MCP", () => {
    expect(YISHAN_RUNTIME_MCP_ENABLED).toBe(false);
    expect(YISHAN_AGENT_SPINE_CONFIG).toEqual({
      workspaceContext: { maxBytes: 16 * 1024 },
      skills: { enabled: true },
      toolBash: {},
      toolJobs: {},
      goals: {},
    });
    expect(YISHAN_AGENT_SPINE_CONFIG).not.toHaveProperty("mcp");
  });
});

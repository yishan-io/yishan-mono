import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Context } from "@deepseek-ai/cordis";
import { name as workspacePluginName } from "@yishan-io/dsh-workspace";
import { describe, expect, it } from "vitest";

import {
  YISHAN_AGENT_SPINE_CONFIG,
  YISHAN_RUNTIME_MCP_ENABLED,
  YISHAN_SUBAGENT_SPAWN_CONFIG,
  YISHAN_SUBAGENT_TOOL_CONFIG,
  installCoreServices,
} from "./core";

describe("runtime core services", () => {
  it("enables all built-in agent-spine capabilities without MCP", () => {
    expect(YISHAN_RUNTIME_MCP_ENABLED).toBe(false);
    expect(YISHAN_AGENT_SPINE_CONFIG).toEqual({
      workspaceContext: { maxBytes: 16 * 1024 },
      maxParallelToolCalls: 10,
      skills: { enabled: true },
      toolBash: {},
      toolJobs: {},
      goals: {},
    });
    expect(YISHAN_AGENT_SPINE_CONFIG).not.toHaveProperty("mcp");
  });

  it("limits native subagents to fresh direct children on the parent workspace", () => {
    expect(YISHAN_SUBAGENT_SPAWN_CONFIG).toEqual({ providerName: "spawn" });
    expect(YISHAN_SUBAGENT_TOOL_CONFIG).toEqual({
      provider: "spawn",
      enableRunInBackground: false,
      maxDepth: 1,
    });
  });

  it("registers the native spawn provider and its model-facing tool", async () => {
    const context = new Context();
    try {
      await installCoreServices(context, await mkdtemp(join(tmpdir(), "yishan-dsh-subagent-")));

      expect(context.subagents.getProvider(YISHAN_SUBAGENT_SPAWN_CONFIG.providerName)).toMatchObject({
        name: "spawn",
        inheritsParentContext: false,
      });
      expect(context.tools.get("subagent")).toBeDefined();
      expect(context.yishanWorkspaceHost).toBeDefined();
      expect(workspacePluginName).toBe("dsh-workspace");
    } finally {
      await context.fiber.dispose();
    }
  });
});

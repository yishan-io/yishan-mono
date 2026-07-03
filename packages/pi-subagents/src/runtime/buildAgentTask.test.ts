import { describe, expect, it } from "vitest";

import type { AgentDefinition } from "../agents/types";
import { buildAgentTask } from "./buildAgentTask";

const baseAgentDefinition: AgentDefinition = {
  name: "Explore",
  description: "Search the codebase",
  systemPrompt: "Explore prompt",
  source: "builtin",
};

describe("buildAgentTask", () => {
  it("defaults unspecified agents to read-only tools", () => {
    const task = buildAgentTask({
      agentName: "Explore",
      agentDefinition: baseAgentDefinition,
      prompt: "Inspect auth",
      cwd: "/tmp/project",
      mode: "foreground",
    });

    expect(task.tools).toEqual(["read", "grep", "find", "ls"]);
    expect(task.readOnly).toBe(true);
  });

  it("marks agents with write-capable tools as non-read-only by default", () => {
    const task = buildAgentTask({
      agentName: "Worker",
      agentDefinition: {
        ...baseAgentDefinition,
        name: "Worker",
        tools: ["read", "write"],
      },
      prompt: "Implement auth",
      cwd: "/tmp/project",
      mode: "foreground",
    });

    expect(task.tools).toEqual(["read", "write"]);
    expect(task.readOnly).toBe(false);
  });
});

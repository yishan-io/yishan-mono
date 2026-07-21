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
  it("defaults unspecified agents to read access with read-only tools", () => {
    const task = buildAgentTask({
      agentName: "Explore",
      agentDefinition: baseAgentDefinition,
      prompt: "Inspect auth",
      cwd: "/tmp/project",
      mode: "foreground",
    });

    expect(task.tools).toEqual(["read", "grep", "find", "ls"]);
    expect(task.workspaceAccess).toBe("read");
  });

  it("marks agents with write-capable tools as write access by default", () => {
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
    expect(task.workspaceAccess).toBe("write");
  });

  it("treats bash and apply_patch as write access even when frontmatter says read-only", () => {
    const task = buildAgentTask({
      agentName: "Reviewer",
      agentDefinition: {
        ...baseAgentDefinition,
        name: "Reviewer",
        tools: ["read", "bash", "apply_patch"],
        readOnly: true,
      },
      prompt: "Review changes",
      cwd: "/tmp/project",
      mode: "foreground",
    });

    expect(task.tools).toEqual(["read", "bash", "apply_patch"]);
    expect(task.workspaceAccess).toBe("write");
  });

  it("keeps agents with explicit read-only tools in the read lane even when frontmatter says read_only false", () => {
    const task = buildAgentTask({
      agentName: "Searcher",
      agentDefinition: {
        ...baseAgentDefinition,
        name: "Searcher",
        tools: ["read", "grep"],
        readOnly: false,
      },
      prompt: "Search auth",
      cwd: "/tmp/project",
      mode: "foreground",
    });

    expect(task.tools).toEqual(["read", "grep"]);
    expect(task.workspaceAccess).toBe("read");
  });
});

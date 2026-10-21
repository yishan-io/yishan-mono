import { expectTypeOf, it } from "vitest";

import type { AgentTask as DelegationTask } from "../delegation";
import type { AgentTask } from "../index";
import type { buildAgentTask } from "../runtime/buildAgentTask";

it("preserves legacy public AgentTask inputs without a resolved system prompt", () => {
  const task: AgentTask = {
    agentName: "Explore",
    prompt: "Inspect auth",
    mode: "foreground",
    cwd: "/tmp/project",
    workspaceAccess: "read",
    agentDefinition: {
      name: "Explore",
      description: "Explore the workspace",
      systemPrompt: "Explore prompt",
      source: "builtin",
    },
  };
  expectTypeOf(task).toEqualTypeOf<AgentTask>();
  const withoutDefinition: AgentTask = {
    agentName: "Explore",
    prompt: "Inspect auth",
    mode: "foreground",
    cwd: "/tmp/project",
    workspaceAccess: "read",
  };
  expectTypeOf(withoutDefinition).toEqualTypeOf<AgentTask>();
});

it("keeps the neutral core and built tasks resolved", () => {
  expectTypeOf<Pick<DelegationTask, "systemPrompt">>().toEqualTypeOf<{ systemPrompt: string }>();
  expectTypeOf<ReturnType<typeof buildAgentTask>>().toExtend<DelegationTask>();
});

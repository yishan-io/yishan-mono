import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { AgentRegistry } from "../agents/registry";
import type { AgentTask } from "../agents/types";
import type { AgentManager } from "../runtime/agentManager";
import { buildAgentTask } from "../runtime/buildAgentTask";

const agentToolSchema = Type.Object({
  agent: Type.String({ description: "Name of the agent definition to run" }),
  prompt: Type.String({ description: "Task prompt for the selected agent" }),
  background: Type.Optional(Type.Boolean({ description: "Run in background and return an agent id immediately" })),
});

/**
 * Registers the main-agent `Agent` tool backed by the shared manager.
 */
export function registerAgentTool(pi: ExtensionAPI, registry: AgentRegistry, manager: AgentManager): void {
  pi.registerTool({
    name: "Agent",
    label: "Agent",
    description: "Delegate work to one named sub-agent using the shared agent manager.",
    promptSnippet: "Delegate focused work to a named sub-agent and optionally run it in the background.",
    promptGuidelines: [
      "Use Agent when a task is independent enough to hand off to one specialized sub-agent.",
      "Use Agent with background=true when the work can continue asynchronously while you do something else.",
    ],
    parameters: agentToolSchema,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      registry.reload();
      const agentDefinition = registry.getByName(params.agent);
      if (!agentDefinition) {
        throw new Error(`Unknown agent: ${params.agent}`);
      }

      const task: AgentTask = buildAgentTask({
        agentName: agentDefinition.name,
        agentDefinition,
        prompt: params.prompt,
        cwd: ctx.cwd,
        mode: params.background ? "background" : "foreground",
      });

      if (params.background) {
        const agentId = await manager.runInBackground(task);
        return {
          content: [{ type: "text", text: `Started ${agentDefinition.name} as ${agentId}` }],
          details: { agentId, mode: "background" },
        };
      }

      const result = await manager.run(task);
      const payload = result.responseText ?? result.error ?? "(no output)";
      return {
        content: [{ type: "text", text: payload }],
        details: { agentId: result.agentId, status: result.status, transcriptPath: result.transcriptPath },
      };
    },
  });
}

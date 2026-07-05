import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
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

interface AgentToolDetails {
  agentId: string;
  status?: string;
  transcriptPath?: string;
  mode: "background" | "foreground";
}

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
      "When you decide to use Agent, call it directly without narrating the delegation plan to the user first.",
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
          details: { agentId, mode: "background" } satisfies AgentToolDetails,
        };
      }

      const result = await manager.run(task);
      const payload = result.responseText ?? result.error ?? "(no output)";
      return {
        content: [{ type: "text", text: payload }],
        details: {
          agentId: result.agentId,
          status: result.status,
          transcriptPath: result.transcriptPath,
          mode: "foreground",
        } satisfies AgentToolDetails,
      };
    },
    renderCall(args, theme, _context) {
      const modeLabel = args.background ? theme.fg("muted", " [bg]") : "";
      let text = theme.fg("toolTitle", theme.bold("Agent ")) + theme.fg("accent", args.agent) + modeLabel;
      text += `\n${theme.fg("dim", truncateSingleLine(args.prompt, 80))}`;
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme, _context) {
      if (isPartial) {
        return new Text(theme.fg("warning", "Delegating to sub-agent..."), 0, 0);
      }

      const details = result.details as AgentToolDetails | undefined;
      const payload = getToolTextContent(result);
      if (!details) {
        return new Text(payload, 0, 0);
      }

      if (details.mode === "background") {
        return new Text(theme.fg("success", `Started in background as ${details.agentId}`), 0, 0);
      }

      const statusText = details.status ?? "completed";
      const statusColor = statusText === "completed" ? "success" : statusText === "failed" ? "error" : "warning";
      let text = theme.fg(statusColor, statusText);
      text += theme.fg("muted", ` · ${details.agentId}`);

      if (!expanded) {
        text += `\n${theme.fg("muted", "(expand for full sub-agent output)")}`;
        return new Text(text, 0, 0);
      }

      if (details.transcriptPath) {
        text += `\n${theme.fg("dim", `transcript: ${details.transcriptPath}`)}`;
      }
      text += `\n\n${payload}`;
      return new Text(text, 0, 0);
    },
  });
}

function getToolTextContent(result: { content: Array<{ type: string; text?: string }> }): string {
  return (
    result.content
      .filter((item): item is { type: "text"; text: string } => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n")
      .trim() || "(no output)"
  );
}

function truncateSingleLine(text: string, maxLength: number): string {
  const normalizedText = text.replaceAll(/\s+/g, " ").trim();
  if (normalizedText.length <= maxLength) {
    return normalizedText;
  }

  return `${normalizedText.slice(0, maxLength - 3)}...`;
}

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";

import type { AgentRegistry } from "../agents/registry";
import type { AgentTask } from "../agents/types";
import type { AgentManager } from "../runtime/agentManager";
import { buildAgentTask } from "../runtime/buildAgentTask";
import { createParentSessionWriter, getParentSessionReference } from "../runtime/sessionRelationship";

const AGENT_SEND_PROMPT_HEADER = "The following sub-agents completed their tasks.";
const AGENT_SEND_PROMPT_FOOTER = "Review the findings, resolve conflicts, and produce the final response.";
const BACKGROUND_FLAG = "--background";

/**
 * Registers the slash-command surface for Pi sub-agents.
 */
export function registerAgentCommands(pi: ExtensionAPI, registry: AgentRegistry, manager: AgentManager): void {
  pi.registerCommand("agents", {
    description: "List loaded agent definitions and runtime state",
    handler: async (_args, ctx) => {
      registry.reload();
      const lines = [
        "Agents:",
        ...registry
          .list()
          .map(
            (agentDefinition) =>
              `- ${agentDefinition.name} (${agentDefinition.source}) — ${agentDefinition.description}`,
          ),
        "",
        "Runs:",
        ...formatRunLines(manager),
      ];
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("agent", {
    description: "Run one agent: /agent <name> [--background] <prompt>",
    getArgumentCompletions: (prefix) => getAgentNameCompletions(registry, prefix),
    handler: async (args, ctx) => {
      registry.reload();
      const parsedArguments = parseAgentCommandArguments(args);
      if (!parsedArguments.agentName || !parsedArguments.prompt) {
        ctx.ui.notify("Usage: /agent <name> [--background] <prompt>", "error");
        return;
      }

      const agentDefinition = registry.getByName(parsedArguments.agentName);
      if (!agentDefinition) {
        ctx.ui.notify(`Unknown agent: ${parsedArguments.agentName}`, "error");
        return;
      }

      const task = buildAgentTask({
        agentName: agentDefinition.name,
        agentDefinition,
        prompt: parsedArguments.prompt,
        cwd: ctx.cwd,
        mode: parsedArguments.isBackground ? "background" : "foreground",
      });
      task.parentSession = getParentSessionReference(ctx.sessionManager, ctx.cwd);
      task.parentSessionWriter = createParentSessionWriter(ctx.sessionManager);

      if (parsedArguments.isBackground) {
        const agentId = await manager.runInBackground(task);
        ctx.ui.notify(`Started ${agentDefinition.name} as ${agentId}`, "info");
        return;
      }

      const result = await manager.run(task);
      ctx.ui.notify(formatAgentResultSummary(result), result.status === "completed" ? "info" : "warning");
    },
  });

  pi.registerCommand("agent-result", {
    description: "Show one agent result: /agent-result <id>",
    getArgumentCompletions: (prefix) => getAgentIdCompletions(manager, prefix),
    handler: async (args, ctx) => {
      const agentId = args.trim();
      if (agentId.length === 0) {
        ctx.ui.notify("Usage: /agent-result <id>", "error");
        return;
      }

      const record = manager.get(agentId);
      if (!record) {
        ctx.ui.notify(`Unknown agent id: ${agentId}`, "error");
        return;
      }

      const payload = [
        `${record.id} — ${record.agentName}`,
        `status: ${record.status}`,
        record.responseText ? `response: ${record.responseText}` : undefined,
        record.error ? `error: ${record.error}` : undefined,
        record.sessionPath ? `session: ${record.sessionPath}` : undefined,
      ]
        .filter((line): line is string => Boolean(line))
        .join("\n");
      ctx.ui.notify(payload, record.status === "completed" ? "info" : "warning");
    },
  });

  pi.registerCommand("agent-stop", {
    description: "Stop one queued or running agent: /agent-stop <id>",
    getArgumentCompletions: (prefix) => getAgentIdCompletions(manager, prefix),
    handler: async (args, ctx) => {
      const agentId = args.trim();
      if (agentId.length === 0) {
        ctx.ui.notify("Usage: /agent-stop <id>", "error");
        return;
      }

      const stopped = await manager.stop(agentId);
      if (!stopped) {
        ctx.ui.notify(`Unknown running agent or child session: ${agentId}`, "error");
        return;
      }
      ctx.ui.notify(`Stop requested for ${agentId}`, "info");
    },
  });

  pi.registerCommand("agent-steer", {
    description: "Steer one running agent: /agent-steer <id> <message>",
    getArgumentCompletions: (prefix) => getAgentIdCompletions(manager, prefix),
    handler: async (args, ctx) => {
      const trimmedArgs = args.trim();
      const firstSpaceIndex = trimmedArgs.indexOf(" ");
      if (firstSpaceIndex < 0) {
        ctx.ui.notify("Usage: /agent-steer <id> <message>", "error");
        return;
      }

      const agentId = trimmedArgs.slice(0, firstSpaceIndex);
      const message = trimmedArgs.slice(firstSpaceIndex + 1).trim();
      if (message.length === 0) {
        ctx.ui.notify("Usage: /agent-steer <id> <message>", "error");
        return;
      }

      await manager.steer(agentId, message);
      ctx.ui.notify(`Steered ${agentId}`, "info");
    },
  });

  pi.registerCommand("agent-send", {
    description: "Manually send completed sub-agent results to the main agent",
    getArgumentCompletions: (prefix) => getAgentIdCompletions(manager, prefix),
    handler: async (args, ctx) => {
      const requestedAgentIds = args
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      const agentIds = requestedAgentIds.length > 0 ? requestedAgentIds : manager.list().map((record) => record.id);
      const resultPayload = manager.collectResults(agentIds);
      if (resultPayload.length === 0) {
        ctx.ui.notify("No completed agent results available to send", "warning");
        return;
      }

      const message = `${AGENT_SEND_PROMPT_HEADER}\n\n${resultPayload}\n\n${AGENT_SEND_PROMPT_FOOTER}`;
      if (ctx.isIdle()) {
        pi.sendUserMessage(message);
      } else {
        pi.sendUserMessage(message, { deliverAs: "followUp" });
      }
      ctx.ui.notify("Queued sub-agent results for the main agent", "info");
    },
  });
}

function parseAgentCommandArguments(args: string): { agentName?: string; prompt?: string; isBackground: boolean } {
  const tokens = args.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { isBackground: false };
  }

  let isBackground = false;
  let currentIndex = 0;

  if (tokens[currentIndex] === BACKGROUND_FLAG) {
    isBackground = true;
    currentIndex += 1;
  }

  const agentName = tokens[currentIndex];
  if (!agentName) {
    return { isBackground };
  }
  currentIndex += 1;

  if (tokens[currentIndex] === BACKGROUND_FLAG) {
    isBackground = true;
    currentIndex += 1;
  }

  const prompt = tokens.slice(currentIndex).join(" ").trim();
  return {
    agentName,
    prompt: prompt.length > 0 ? prompt : undefined,
    isBackground,
  };
}

function getAgentNameCompletions(registry: AgentRegistry, prefix: string): AutocompleteItem[] | null {
  registry.reload();
  const normalizedPrefix = prefix.trim().toLowerCase();
  const items = registry
    .list()
    .map((agentDefinition) => ({
      value: agentDefinition.name,
      label: agentDefinition.name,
      description: agentDefinition.description,
    }))
    .filter((item) => item.value.toLowerCase().startsWith(normalizedPrefix));
  return items.length > 0 ? items : null;
}

function getAgentIdCompletions(manager: AgentManager, prefix: string): AutocompleteItem[] | null {
  const normalizedPrefix = prefix.trim().toLowerCase();
  const items = manager
    .list()
    .map((record) => ({
      value: record.id,
      label: record.id,
      description: `${record.agentName} · ${record.status}`,
    }))
    .filter((item) => item.value.toLowerCase().startsWith(normalizedPrefix));
  return items.length > 0 ? items : null;
}

function formatRunLines(manager: AgentManager): string[] {
  const records = manager.list();
  if (records.length === 0) {
    return ["- none"];
  }

  return records.map((record) => `- ${record.id} (${record.agentName}) — ${record.status}`);
}

function formatAgentResultSummary(result: Awaited<ReturnType<AgentManager["run"]>>): string {
  const payload = result.responseText ?? result.error ?? "(no output)";
  return `${result.agentId} — ${result.agentName}\nstatus: ${result.status}\n${payload}`;
}

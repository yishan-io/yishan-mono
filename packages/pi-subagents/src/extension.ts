import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { AgentRegistry } from "./agents/registry";
import { registerAgentCommands } from "./commands/registerAgentCommands";
import { createAgentAutocompleteProvider } from "./input/autocompleteProvider";
import { parseAgentInvocation } from "./input/invocationParser";
import { rewriteDelegationMessage } from "./input/rewriteDelegationMessage";
import { AgentManager } from "./runtime/agentManager";
import { registerAgentTool } from "./tools/agentTool";
import { bindAgentProgressUi, clearAgentProgress, renderPendingDelegation } from "./ui/agentProgress";

const DELEGATION_GUIDANCE = `You can delegate work to sub-agents using the Agent tool.

Use sub-agents when:

- A task contains independent workstreams.
- Codebase exploration would consume substantial context.
- Independent research can run in parallel.
- A specialist agent can perform a focused review.

Do not delegate trivial tasks.

Prefer read-only agents for parallel work.

You remain responsible for validating sub-agent results and producing the final answer.`;

/**
 * Registers the Pi sub-agents extension.
 */
export function createPiSubagentsExtension(pi: ExtensionAPI): void {
  const registry = new AgentRegistry({ cwd: process.cwd() });
  const manager = new AgentManager();
  let disposeAgentProgressUi: (() => void) | undefined;
  let pendingDelegationAgentNames: string[] | undefined;

  registerAgentCommands(pi, registry, manager);
  registerAgentTool(pi, registry, manager);

  pi.on("session_start", async (_event, ctx) => {
    registry.reload();
    ctx.ui.addAutocompleteProvider((current) => createAgentAutocompleteProvider(current, registry.list()));
    disposeAgentProgressUi?.();
    disposeAgentProgressUi = bindAgentProgressUi(manager, ctx.ui);
  });

  pi.on("input", async (event, ctx) => {
    registry.reload();
    const parsedInvocation = parseAgentInvocation(
      event.text,
      registry.list().map((agentDefinition) => agentDefinition.name),
    );
    if (!parsedInvocation) {
      return { action: "continue" };
    }

    if (parsedInvocation.kind === "error") {
      ctx.ui.notify(parsedInvocation.message, "error");
      return { action: "handled" };
    }

    pendingDelegationAgentNames = [...parsedInvocation.invocation.agents];
    renderPendingDelegation(ctx.ui, pendingDelegationAgentNames);
    return { action: "continue" };
  });

  pi.on("tool_execution_start", async (event) => {
    if (event.toolName !== "Agent") {
      return;
    }

    pendingDelegationAgentNames = undefined;
  });

  pi.on("agent_end", async (_event, ctx) => {
    if (!pendingDelegationAgentNames) {
      return;
    }

    pendingDelegationAgentNames = undefined;
    if (manager.list().every((record) => record.status !== "queued" && record.status !== "running")) {
      clearAgentProgress(ctx.ui);
    }
  });

  pi.on("context", async (event) => {
    registry.reload();
    const knownAgentNames = registry.list().map((agentDefinition) => agentDefinition.name);

    return {
      messages: event.messages.map((message) => {
        if (message.role !== "user") {
          return message;
        }

        return rewriteDelegationMessage(message, knownAgentNames);
      }),
    };
  });

  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${DELEGATION_GUIDANCE}`,
  }));

  pi.on("session_shutdown", async () => {
    pendingDelegationAgentNames = undefined;
    disposeAgentProgressUi?.();
    disposeAgentProgressUi = undefined;

    const activeRecords = manager
      .list()
      .filter((record) => record.status === "queued" || record.status === "running")
      .map((record) => record.id);
    await Promise.all(activeRecords.map((agentId) => manager.stop(agentId)));
  });
}

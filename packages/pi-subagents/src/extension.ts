import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { AgentRegistry } from "./agents/registry";
import { registerAgentCommands } from "./commands/registerAgentCommands";
import { createAgentAutocompleteProvider } from "./input/autocompleteProvider";
import { parseAgentInvocation } from "./input/invocationParser";
import { AgentManager } from "./runtime/agentManager";
import { buildAgentTask } from "./runtime/buildAgentTask";
import { registerAgentTool } from "./tools/agentTool";
import { bindAgentProgressUi } from "./ui/agentProgress";

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

    const tasks = parsedInvocation.invocation.agents
      .map((agentName) => registry.getByName(agentName))
      .filter((agentDefinition): agentDefinition is NonNullable<typeof agentDefinition> => Boolean(agentDefinition))
      .map((agentDefinition) =>
        buildAgentTask({
          agentName: agentDefinition.name,
          agentDefinition,
          prompt: parsedInvocation.invocation.prompt,
          cwd: ctx.cwd,
          mode: parsedInvocation.invocation.mode,
        }),
      );

    const results =
      tasks.length === 1 && tasks[0] !== undefined ? [await manager.run(tasks[0])] : await manager.runParallel(tasks);
    const summary = results.map(
      (result) => `${result.agentName} (${result.status}): ${result.responseText ?? result.error ?? "(no output)"}`,
    );
    const hasOnlyCompletedResults = results.every((result) => result.status === "completed");
    ctx.ui.notify(summary.join("\n\n"), hasOnlyCompletedResults ? "info" : "warning");
    return { action: "handled" };
  });

  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${DELEGATION_GUIDANCE}`,
  }));

  pi.on("session_shutdown", async () => {
    disposeAgentProgressUi?.();
    disposeAgentProgressUi = undefined;

    const activeRecords = manager
      .list()
      .filter((record) => record.status === "queued" || record.status === "running")
      .map((record) => record.id);
    await Promise.all(activeRecords.map((agentId) => manager.stop(agentId)));
  });
}

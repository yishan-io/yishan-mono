import type { ExtensionAPI, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";

import { AgentRegistry } from "./agents/registry";
import { registerAgentCommands } from "./commands/registerAgentCommands";
import { createAgentAutocompleteProvider } from "./input/autocompleteProvider";
import { parseAgentInvocation } from "./input/invocationParser";
import { rewriteDelegationMessage } from "./input/rewriteDelegationMessage";
import { AgentManager } from "./runtime/agentManager";
import { registerAgentTool } from "./tools/agentTool";
import { openAgentLiveOverlay } from "./ui/agentLiveOverlay";
import { bindAgentProgressUi, clearAgentProgress, renderPendingDelegation } from "./ui/agentProgress";

const DELEGATION_GUIDANCE = `You can delegate work to sub-agents using the Agent tool.

Use Agent when:

- A task contains independent workstreams.
- Codebase exploration would consume substantial context.
- Independent research can run in parallel.
- A specialist agent can perform a focused review.

Do not use Agent when:

- You already know the exact file to read.
- A quick grep/search will answer the question.
- The task is trivial or limited to one or two local file checks.

If workstreams are independent, delegate them separately and prefer read-only agents for parallel work.
Use background runs only when you can continue with non-overlapping work while the sub-agent runs.

Once you delegate work, do not duplicate the same exploration or edits yourself. Wait for the result or continue only with non-overlapping tasks.

When delegating, clearly state whether the sub-agent should do research or modify code, point it to the most relevant files or directories, and tell it what result to return.

You remain responsible for validating sub-agent results and producing the final answer.`;

/**
 * Registers the Pi sub-agents extension.
 */
export function createPiSubagentsExtension(pi: ExtensionAPI): void {
  const registry = new AgentRegistry({ cwd: process.cwd() });
  const manager = new AgentManager();
  let disposeAgentProgressUi: (() => void) | undefined;
  let pendingDelegationAgentNames: string[] | undefined;

  const resolveAgentRecord = async (args: string, ctx: { ui: Pick<ExtensionUIContext, "notify" | "select"> }) => {
    const trimmedArgs = args.trim();
    const records = manager.list();
    if (records.length === 0) {
      ctx.ui.notify("No agent runs available", "warning");
      return undefined;
    }

    let agentId = trimmedArgs;
    if (agentId.length === 0) {
      const selectionOptions = records.map((record) => `${record.id} · ${record.agentName} · ${record.status}`);
      const selection = await ctx.ui.select("Select sub-agent", selectionOptions);
      if (!selection) {
        return undefined;
      }

      const selectedRecord = records.find(
        (record) => `${record.id} · ${record.agentName} · ${record.status}` === selection,
      );
      if (!selectedRecord) {
        ctx.ui.notify("Failed to resolve selected agent", "error");
        return undefined;
      }
      agentId = selectedRecord.id;
    }

    const selectedRecord = manager.get(agentId);
    if (!selectedRecord) {
      ctx.ui.notify(`Unknown agent id: ${agentId}`, "error");
      return undefined;
    }

    return selectedRecord;
  };

  const openAgentView = async (args: string, ctx: { ui: Pick<ExtensionUIContext, "custom" | "notify" | "select"> }) => {
    const selectedRecord = await resolveAgentRecord(args, ctx);
    if (!selectedRecord) {
      return;
    }

    await openAgentLiveOverlay(selectedRecord, manager, ctx.ui);
  };

  registerAgentCommands(pi, registry, manager);
  registerAgentTool(pi, registry, manager);

  pi.registerCommand("agent-view", {
    description: "Select one agent and open its live popup viewer",
    getArgumentCompletions: (prefix) => {
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
    },
    handler: async (args, ctx) => {
      await openAgentView(args, ctx);
    },
  });

  pi.registerShortcut(Key.ctrl("j"), {
    description: "Open live sub-agent viewer",
    handler: async (ctx) => {
      await openAgentView("", ctx);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    registry.reload();
    ctx.ui.addAutocompleteProvider((current) => createAgentAutocompleteProvider(current, registry.list()));
    disposeAgentProgressUi?.();
    disposeAgentProgressUi = bindAgentProgressUi(manager, ctx.ui, ctx.mode);
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
    if (
      manager
        .list()
        .every((record) => record.status !== "queued" && record.status !== "starting" && record.status !== "running")
    ) {
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
    await manager.shutdown();
  });
}

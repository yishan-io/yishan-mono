import type { ExtensionAPI, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey } from "@earendil-works/pi-tui";

import { AgentRegistry } from "./agents/registry";
import { registerAgentCommands } from "./commands/registerAgentCommands";
import { createAgentAutocompleteProvider } from "./input/autocompleteProvider";
import { parseAgentInvocation } from "./input/invocationParser";
import { rewriteDelegationMessage } from "./input/rewriteDelegationMessage";
import { AgentManager } from "./runtime/agentManager";
import { registerAgentTool } from "./tools/agentTool";
import { clearSelectedAgentDetails, renderSelectedAgentDetails } from "./ui/agentDetails";
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
  let activeUi: ExtensionUIContext | undefined;
  let disposeAgentProgressUi: (() => void) | undefined;
  let detailRefreshInterval: ReturnType<typeof setInterval> | undefined;
  let disposeTerminalInputListener: (() => void) | undefined;
  let pendingDelegationAgentNames: string[] | undefined;
  let selectedAgentId: string | undefined;
  let lastEscapeTimestamp = 0;

  const stopDetailRefresh = () => {
    if (detailRefreshInterval) {
      clearInterval(detailRefreshInterval);
      detailRefreshInterval = undefined;
    }
  };

  const clearSelectedAgentDetailsWidget = () => {
    selectedAgentId = undefined;
    stopDetailRefresh();
    if (activeUi) {
      clearSelectedAgentDetails(activeUi);
    }
  };

  const renderSelectedAgentDetailsWidget = () => {
    if (!activeUi || !selectedAgentId) {
      return;
    }

    const record = manager.get(selectedAgentId);
    if (!record) {
      clearSelectedAgentDetailsWidget();
      return;
    }

    if (record.status !== "queued" && record.status !== "starting" && record.status !== "running") {
      stopDetailRefresh();
    }

    renderSelectedAgentDetails(activeUi, record);
  };

  const startDetailRefresh = () => {
    stopDetailRefresh();
    if (!selectedAgentId) {
      return;
    }

    const selectedRecord = manager.get(selectedAgentId);
    if (
      !selectedRecord ||
      (selectedRecord.status !== "queued" &&
        selectedRecord.status !== "starting" &&
        selectedRecord.status !== "running")
    ) {
      return;
    }

    detailRefreshInterval = setInterval(() => {
      renderSelectedAgentDetailsWidget();
    }, 250);
  };

  const selectAgentForDetails = (agentId: string) => {
    selectedAgentId = agentId;
    renderSelectedAgentDetailsWidget();
    startDetailRefresh();
  };

  const clearSelectedAgentDetailsWithNotification = (ctx: { ui: Pick<ExtensionUIContext, "notify"> }) => {
    if (!selectedAgentId) {
      ctx.ui.notify("No selected sub-agent detail panel", "warning");
      return;
    }

    clearSelectedAgentDetailsWidget();
    ctx.ui.notify("Cleared selected sub-agent detail panel", "info");
  };

  const openAgentView = async (args: string, ctx: { ui: Pick<ExtensionUIContext, "notify" | "select"> }) => {
    const trimmedArgs = args.trim();
    const records = manager.list();
    if (records.length === 0) {
      ctx.ui.notify("No agent runs available", "warning");
      return;
    }

    let agentId = trimmedArgs;
    if (agentId.length === 0) {
      const selectionOptions = records.map((record) => `${record.id} · ${record.agentName} · ${record.status}`);
      const selection = await ctx.ui.select("Select sub-agent", selectionOptions);
      if (!selection) {
        return;
      }

      const selectedRecord = records.find(
        (record) => `${record.id} · ${record.agentName} · ${record.status}` === selection,
      );
      if (!selectedRecord) {
        ctx.ui.notify("Failed to resolve selected agent", "error");
        return;
      }
      agentId = selectedRecord.id;
    }

    const selectedRecord = manager.get(agentId);
    if (!selectedRecord) {
      ctx.ui.notify(`Unknown agent id: ${agentId}`, "error");
      return;
    }

    selectAgentForDetails(selectedRecord.id);
    ctx.ui.notify(`Viewing ${selectedRecord.agentName} (${selectedRecord.id})`, "info");
  };

  manager.subscribe(() => {
    renderSelectedAgentDetailsWidget();
  });

  registerAgentCommands(pi, registry, manager);
  registerAgentTool(pi, registry, manager);

  pi.registerCommand("agent-view", {
    description: "Select one agent and show its live details",
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

  pi.registerCommand("agent-view-clear", {
    description: "Clear the selected sub-agent detail panel",
    handler: async (_args, ctx) => {
      clearSelectedAgentDetailsWithNotification(ctx);
    },
  });

  pi.registerShortcut(Key.ctrl("j"), {
    description: "Open sub-agent detail selector",
    handler: async (ctx) => {
      await openAgentView("", ctx);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    activeUi = ctx.ui;
    registry.reload();
    ctx.ui.addAutocompleteProvider((current) => createAgentAutocompleteProvider(current, registry.list()));
    disposeAgentProgressUi?.();
    disposeAgentProgressUi = bindAgentProgressUi(manager, ctx.ui);
    disposeTerminalInputListener?.();
    disposeTerminalInputListener = ctx.ui.onTerminalInput((data) => {
      if (!selectedAgentId || !matchesKey(data, Key.escape)) {
        lastEscapeTimestamp = 0;
        return undefined;
      }

      const now = Date.now();
      if (now - lastEscapeTimestamp <= 350) {
        clearSelectedAgentDetailsWidget();
        ctx.ui.notify("Cleared selected sub-agent detail panel", "info");
        lastEscapeTimestamp = 0;
        return { consume: true, data: "" };
      }

      lastEscapeTimestamp = now;
      return undefined;
    });
    renderSelectedAgentDetailsWidget();
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
    clearSelectedAgentDetailsWidget();
    disposeTerminalInputListener?.();
    disposeTerminalInputListener = undefined;
    activeUi = undefined;
    disposeAgentProgressUi?.();
    disposeAgentProgressUi = undefined;
    await manager.shutdown();
  });
}

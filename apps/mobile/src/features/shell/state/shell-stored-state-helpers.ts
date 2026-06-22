import type { ShellWorkspaceTabState, TerminalItem } from "@/features/shell/state/shell.types";
import { trimTerminalOutputForCache } from "@/features/shell/state/terminal-output";

export function mergeStoredTerminalRuntime(
  terminalsByWorkspaceId: Record<string, TerminalItem[]>,
  runtimeByWorkspaceId: Record<
    string,
    Array<{
      cachedOutput?: string | null;
      id: string;
      lastMessagePreview?: string | null;
      session?: TerminalItem["session"];
      status?: TerminalItem["status"];
    }>
  >,
): Record<string, TerminalItem[]> {
  return Object.fromEntries(
    Object.entries(terminalsByWorkspaceId).map(([workspaceId, terminals]) => {
      const runtimeByTerminalId = Object.fromEntries(
        (runtimeByWorkspaceId[workspaceId] ?? []).map((runtime) => [runtime.id, runtime] as const),
      );

      const merged = terminals.map((terminal) => {
        const runtime = runtimeByTerminalId[terminal.id];
        if (!runtime) {
          return terminal;
        }

        return {
          ...terminal,
          cachedOutput:
            typeof runtime.cachedOutput === "string"
              ? trimTerminalOutputForCache(runtime.cachedOutput, 80000)
              : runtime.cachedOutput,
          lastMessagePreview: runtime.lastMessagePreview ?? terminal.lastMessagePreview,
          session: runtime.session ?? terminal.session,
          status: runtime.status ?? terminal.status,
        };
      });

      const latestByGhostKey = new Map<string, TerminalItem>();
      const preserved: TerminalItem[] = [];

      for (const terminal of merged) {
        const hasSessionId = typeof terminal.session?.sessionId === "string" && terminal.session.sessionId.length > 0;
        const hasCachedOutput = typeof terminal.cachedOutput === "string" && terminal.cachedOutput.trim().length > 0;
        const hasPreview =
          typeof terminal.lastMessagePreview === "string" && terminal.lastMessagePreview.trim().length > 0;

        if (hasSessionId || hasCachedOutput || hasPreview) {
          preserved.push(terminal);
          continue;
        }

        const ghostKey = `${terminal.workspaceId}\u0000${terminal.label.trim()}\u0000${terminal.subtitle ?? ""}`;
        const previous = latestByGhostKey.get(ghostKey);
        if (!previous) {
          latestByGhostKey.set(ghostKey, terminal);
          continue;
        }

        const previousCreatedAt = previous.createdAt ?? previous.updatedAt;
        const nextCreatedAt = terminal.createdAt ?? terminal.updatedAt;
        if (nextCreatedAt.localeCompare(previousCreatedAt) >= 0) {
          latestByGhostKey.set(ghostKey, terminal);
        }
      }

      const deduped = [...preserved, ...latestByGhostKey.values()].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      );

      return [workspaceId, deduped] as const;
    }),
  );
}

export function updateTerminalMap(
  current: Record<string, TerminalItem[]>,
  workspaceId: string,
  terminalId: string,
  updater: (terminal: TerminalItem) => TerminalItem | null,
) {
  const terminals = current[workspaceId];
  if (!terminals?.length) {
    return current;
  }

  let changed = false;
  const nextTerminals = terminals.flatMap((terminal) => {
    if (terminal.id !== terminalId) {
      return [terminal];
    }

    const nextTerminal = updater(terminal);
    if (!nextTerminal) {
      changed = true;
      return [];
    }

    if (nextTerminal !== terminal) {
      changed = true;
    }

    return [nextTerminal];
  });

  if (!changed) {
    return current;
  }

  if (nextTerminals.length === 0) {
    const next = { ...current };
    delete next[workspaceId];
    return next;
  }

  return {
    ...current,
    [workspaceId]: nextTerminals,
  };
}

export function upsertTerminalMap(
  current: Record<string, TerminalItem[]>,
  workspaceId: string,
  nextTerminal: TerminalItem,
) {
  const terminals = current[workspaceId] ?? [];
  const sessionId = nextTerminal.session?.sessionId ?? null;
  const existingIndex = terminals.findIndex(
    (terminal) => terminal.id === nextTerminal.id || (!!sessionId && terminal.session?.sessionId === sessionId),
  );

  if (existingIndex === -1) {
    return {
      ...current,
      [workspaceId]: [nextTerminal, ...terminals],
    };
  }

  const existing = terminals[existingIndex];
  if (!existing) {
    return current;
  }

  const merged: TerminalItem = {
    ...existing,
    ...nextTerminal,
    id: existing.id,
    label: existing.label,
    createdAt: existing.createdAt ?? nextTerminal.createdAt,
    updatedAt:
      existing.updatedAt.localeCompare(nextTerminal.updatedAt) >= 0 ? existing.updatedAt : nextTerminal.updatedAt,
    cachedOutput: nextTerminal.cachedOutput ?? existing.cachedOutput,
    lastMessagePreview: nextTerminal.lastMessagePreview ?? existing.lastMessagePreview,
    userRenamed: existing.userRenamed ?? nextTerminal.userRenamed,
  };

  const nextTerminals = [...terminals];
  nextTerminals[existingIndex] = merged;
  return {
    ...current,
    [workspaceId]: nextTerminals,
  };
}

function buildTerminalSessionFromWorkspaceTab(
  terminal: TerminalItem | undefined,
  tab: ShellWorkspaceTabState["tabs"][number],
  workspaceId: string,
): TerminalItem["session"] {
  if (tab.kind !== "terminal") {
    return terminal?.session ?? null;
  }

  if (!tab.data.sessionId) {
    return terminal?.session ?? null;
  }

  if (terminal?.session?.sessionId === tab.data.sessionId) {
    return {
      ...terminal.session,
      paneId: tab.data.paneId ?? terminal.session.paneId,
      sessionId: tab.data.sessionId,
      tabId: tab.id,
      workspaceId,
    };
  }

  return {
    paneId: tab.data.paneId,
    sessionId: tab.data.sessionId,
    status: "running",
    tabId: tab.id,
    workspaceId,
  };
}

export function syncTerminalMapForWorkspaceTabs(
  current: Record<string, TerminalItem[]>,
  input: {
    nodeId: string | null;
    orgId: string;
    projectId: string;
    tabState: ShellWorkspaceTabState;
    workspaceId: string;
    workspaceLabel?: string | null;
  },
) {
  const currentTerminals = current[input.workspaceId] ?? [];
  const nextTerminals = input.tabState.tabs
    .filter(
      (tab): tab is Extract<ShellWorkspaceTabState["tabs"][number], { kind: "terminal" }> => tab.kind === "terminal",
    )
    .map((tab) => {
      const existing =
        currentTerminals.find((terminal) => terminal.id === tab.data.terminalId) ??
        currentTerminals.find((terminal) => !!tab.data.sessionId && terminal.session?.sessionId === tab.data.sessionId);
      const now = new Date().toISOString();

      return {
        ...existing,
        agentKind: existing?.agentKind ?? tab.data.agentKind,
        createdAt: existing?.createdAt ?? now,
        id: tab.data.terminalId,
        label: existing?.label ?? tab.title ?? tab.data.title,
        launchCommand: existing?.launchCommand ?? tab.data.launchCommand ?? null,
        nodeId: existing?.nodeId ?? input.nodeId,
        orgId: input.orgId,
        projectId: input.projectId,
        session: buildTerminalSessionFromWorkspaceTab(existing, tab, input.workspaceId),
        status: existing?.status ?? (tab.data.sessionId ? "running" : "initializing"),
        subtitle: existing?.subtitle ?? input.workspaceLabel ?? null,
        updatedAt: existing?.updatedAt ?? now,
        userRenamed: existing?.userRenamed ?? tab.data.userRenamed,
        workspaceId: input.workspaceId,
      } satisfies TerminalItem;
    });

  if (nextTerminals.length === 0) {
    if (!(input.workspaceId in current)) {
      return current;
    }

    const next = { ...current };
    delete next[input.workspaceId];
    return next;
  }

  return {
    ...current,
    [input.workspaceId]: nextTerminals,
  };
}

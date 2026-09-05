import type { AgentToolCallLifecycleState } from "../../../chat/agentChatSubagents";
import type { AgentContentBlock, AgentMessage } from "../../../chat/agentChatTypes";
import type { AgentRuntime } from "../../../daemon/daemonAgentTypes";

/** Target of one completed subagent open action. */
export type CompletedSubagentOpenTarget = {
  agentId?: string;
  childSessionId: string;
  title: string;
  runtime?: AgentRuntime;
};

/** Shared props for one rendered agent tool-call card. */
export type AgentToolCallCardProps = {
  toolCall: Extract<AgentContentBlock, { type: "toolCall" }>;
  result?: AgentMessage | null;
  /** Composer lifecycle state for Agent calls; ignored by non-Agent tool cards. */
  agentLifecycleState?: AgentToolCallLifecycleState;
  dshDelegationState?: import("../../../chat/agentChatDshDelegation").DshDelegationState;
  dshDelegationDiagnostic?: import("../../../chat/agentChatDshDelegation").DshDelegationDiagnostic;
  /** Runtime that produced this tool call; tool names are not runtime-unique. */
  runtime?: AgentRuntime;
  workspacePath?: string;
  onOpenCompletedSubagent?: (target: CompletedSubagentOpenTarget) => void | Promise<void>;
};

/** One tool call paired with its merged result, grouped at turn level. */
export type GroupedToolCall = {
  toolCall: Extract<AgentContentBlock, { type: "toolCall" }>;
  result?: AgentMessage | null;
};

/** One summary line of a tool-call group, formatted via i18n in the UI. */
export type ToolCallSummaryItem = {
  key: "read" | "bash" | "edited" | "searched" | "used";
  count: number;
  toolName?: string;
};

/** Builds the Codex-style group summary counts, e.g. [{ key: "read", count: 2 }, { key: "bash", count: 1 }]. */
export function summarizeToolCalls(calls: GroupedToolCall[]): ToolCallSummaryItem[] {
  const counts = new Map<string, ToolCallSummaryItem>();

  for (const call of calls) {
    const categoryKey = getToolCallCategoryKey(call.toolCall.name);
    const existing = counts.get(categoryKey);
    if (existing) {
      existing.count += 1;
    } else {
      const { key, toolName } = parseToolCallCategoryKey(categoryKey);
      counts.set(categoryKey, { key, count: 1, ...(toolName !== undefined ? { toolName } : {}) });
    }
  }

  return [...counts.values()];
}

function getToolCallCategoryKey(name: string): string {
  switch (name) {
    case "read":
      return "read";
    case "bash":
      return "bash";
    case "edit":
    case "write":
      return "edited";
    case "grep":
      return "searched";
    default:
      return `used:${name}`;
  }
}

function parseToolCallCategoryKey(categoryKey: string): { key: ToolCallSummaryItem["key"]; toolName?: string } {
  if (categoryKey.startsWith("used:")) {
    return { key: "used", toolName: categoryKey.slice("used:".length) };
  }
  return { key: categoryKey as ToolCallSummaryItem["key"] };
}

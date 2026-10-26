import type {
  DisplayRow,
  GroupDisplay,
  GroupSummaryItem,
  ThinkingDisplay,
  ToolCardModel,
  ToolRendererPayload,
  TranscriptDisplay,
} from "./presentation.types";
import { getToolPresentationState } from "./subagents";
import type { SubagentRun } from "./subagents";
import { getToolCall } from "./toolCalls";
import type { ToolCallEntity } from "./toolCalls.types";
import type { ThinkingBlock, ToolCallGroup, TranscriptState } from "./types";

/** Projects one retained entity without modifying its execution ledger. */
export function projectToolCard(
  entity: ToolCallEntity,
  childRuns: ReadonlyMap<string, SubagentRun> = new Map(),
): ToolCardModel {
  const toolCall = {
    id: entity.callId,
    name: entity.owner?.name ?? (nonBlank(entity.result?.toolName) ? entity.result.toolName : "tool"),
    arguments: entity.owner?.arguments ?? {},
  };
  const renderer = entity.owner ? selectRenderer(toolCall.name, toolCall.arguments) : { kind: "generic" as const };
  const isAgent = entity.owner?.name === "Agent";
  const runs = [...childRuns.values()].filter((run) => run.parentCallId === entity.callId);
  const children = new Map(runs.map((run) => [run.childSessionId, run]));
  for (const [id, child] of entity.children ?? []) children.set(id, child);
  const presentationState = getToolPresentationState(isAgent ? { ...entity, children } : entity);
  const terminalChild = isAgent
    ? [...children.values()].find((child) => child.isComplete && nonBlank(child.childSessionId))
    : undefined;
  const metadata = terminalChild ? childRuns.get(terminalChild.childSessionId) : runs[0];
  const agentLabel = nonBlank(metadata?.agentName)
    ? metadata.agentName
    : nonBlank(toolCall.arguments.agent)
      ? toolCall.arguments.agent
      : "Agent";
  const content = entity.result?.content;
  const isError = entity.result?.outcome === "failed" || presentationState === "failed";
  return {
    agentStatus: isAgent ? presentationState : null,
    ...(isAgent
      ? {
          agentLabel,
          agentStatusLabel:
            presentationState === "succeeded"
              ? "completed"
              : presentationState === "interrupted"
                ? "cancelled"
                : presentationState === "pending"
                  ? "queued"
                  : presentationState === "unknown" &&
                      !children.size &&
                      !entity.result &&
                      entity.owner?.source.origin === "live"
                    ? "preparing"
                    : presentationState,
        }
      : {}),
    ...(terminalChild
      ? {
          navigationTarget: {
            childSessionId: terminalChild.childSessionId,
            ...(nonBlank(metadata?.agentId) ? { agentId: metadata.agentId } : {}),
            title: agentLabel,
          },
        }
      : {}),
    kind: "card",
    sessionId: entity.sessionId,
    callId: entity.callId,
    toolCall,
    renderer,
    rendererKind: renderer.kind,
    executionState: entity.executionState,
    presentationState,
    isError,
    hasResult: entity.result !== undefined,
    completeness: content?.availability === "available" ? content.completeness : "missing",
    result:
      content?.availability === "available"
        ? { text: content.text ?? "", ...(content.details !== undefined ? { details: content.details } : {}), isError }
        : null,
    isPending:
      presentationState === "pending" ||
      presentationState === "running" ||
      (presentationState === "unknown" &&
        !!entity.owner &&
        !entity.result &&
        ![...children.values()].some((child) => child.isComplete)),
    isLive: presentationState === "running",
  };
}

function nonBlank(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function selectRenderer(name: string, args: Readonly<Record<string, unknown>>): ToolRendererPayload {
  switch (name) {
    case "read":
    case "memory_read":
    case "edit":
    case "write":
      if (nonBlank(args.path))
        return { kind: name === "read" ? "read" : name === "memory_read" ? "memoryRead" : "diff", path: args.path };
      break;
    case "bash":
      if (nonBlank(args.command)) return { kind: "bash", command: args.command };
      break;
    case "Agent":
      if (nonBlank(args.agent) && nonBlank(args.prompt))
        return { kind: "agent", agent: args.agent, prompt: args.prompt };
      break;
    case "grep":
      if (nonBlank(args.pattern)) return { kind: "grep", pattern: args.pattern };
      break;
    case "memory_search":
      if (nonBlank(args.query)) return { kind: "memorySearch", query: args.query };
      break;
    case "web_fetch": {
      const urls: unknown[] = Array.isArray(args.pages)
        ? args.pages.map((page: unknown) => (isRecord(page) ? page.url : undefined))
        : [args.url];
      const first = urls[0];
      if (nonBlank(first) && urls.every(nonBlank))
        return { kind: "webFetch", urls: [first, ...urls.slice(1).filter(nonBlank)] };
      break;
    }
    case "ask_user":
      return { kind: "askUser", toolName: name };
    case "memory_store":
      return { kind: "memoryStore", toolName: name };
    case "lsp_diagnostics":
    case "lsp_fix":
      return { kind: "lsp", toolName: name };
    case "workspace_list":
    case "workspace_find":
    case "workspace_create":
    case "workspace_close":
      return { kind: "workspace", toolName: name };
    case "task_start":
    case "task_list":
    case "task_read":
    case "task_write":
    case "task_append_note":
    case "task_finish":
      return { kind: "task", toolName: name };
    case "codegraph_search":
    case "codegraph_callers":
    case "codegraph_callees":
    case "codegraph_impact":
    case "codegraph_explore":
    case "codegraph_node":
    case "codegraph_status":
    case "codegraph_files":
      return { kind: "codeGraph", toolName: name };
  }
  return { kind: "generic" };
}

/** Safely extracts summary text from untrusted signature metadata. */
export function projectThinking(
  block: ThinkingBlock,
  scope: string,
  position: number,
  signature: unknown = block.signature,
): ThinkingDisplay {
  let parsed: unknown = signature;
  if (typeof signature === "string") {
    try {
      parsed = JSON.parse(signature);
    } catch {
      parsed = null;
    }
  }
  const summary =
    isRecord(parsed) && Array.isArray(parsed.summary)
      ? parsed.summary
          .flatMap((item: unknown) => (isRecord(item) && nonBlank(item.text) ? [item.text.trim()] : []))
          .join(", ") || null
      : null;
  const normalize = (text: string) =>
    text
      .replace(/[,*_`#>\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const normalizedBody = normalize(block.text);
  return {
    kind: "thinking",
    key:
      block.source?.stability === "stable"
        ? JSON.stringify(["thinking", block.source.id])
        : JSON.stringify(["thinking", scope, position]),
    text: block.text,
    summary: summary?.replaceAll("**", "") ?? null,
    hasDetails: !!normalizedBody && (summary === null || normalizedBody !== normalize(summary)),
    isStreaming: block.isStreaming,
  };
}

function projectGroup(group: ToolCallGroup, getCard: (callId: string) => ToolCardModel): GroupDisplay {
  const members = group.members.map((member, index) =>
    member.kind === "thinking" ? projectThinking(member, group.id, index) : getCard(member.callId),
  );
  const uniqueCards = new Map(
    members.flatMap((member) => (member.kind === "card" ? [[member.callId, member] as const] : [])),
  );
  const summaryItems: GroupSummaryItem[] = [];
  for (const card of uniqueCards.values()) {
    const name = card.toolCall.name;
    const key =
      name === "read"
        ? "read"
        : name === "bash"
          ? "bash"
          : name === "edit" || name === "write"
            ? "edited"
            : name === "grep"
              ? "searched"
              : "used";
    const toolName = key === "used" ? name : undefined;
    const index = summaryItems.findIndex((item) => item.key === key && item.toolName === toolName);
    const previous = summaryItems[index];
    if (previous) summaryItems[index] = { ...previous, count: previous.count + 1 };
    else summaryItems.push({ key, count: 1, ...(toolName !== undefined ? { toolName } : {}) });
  }
  return {
    kind: "group",
    id: group.id,
    members,
    summaryItems,
    callCount: uniqueCards.size,
    pendingMembers: members.filter((member) => (member.kind === "thinking" ? member.isStreaming : member.isPending)),
    isLive: members.some((member) => (member.kind === "thinking" ? member.isStreaming : member.isLive)),
  };
}

/** Canonical-state-only presentation boundary, with one card projection per call. */
export function projectTranscript(
  state: TranscriptState,
  options: { readonly contextTokens?: number } = {},
): TranscriptDisplay {
  const cards = new Map<string, ToolCardModel>();
  const getCard = (callId: string): ToolCardModel => {
    const cached = cards.get(callId);
    if (cached) return cached;
    const entity = getToolCall(state.toolCalls, { sessionId: state.sessionId, callId });
    const card = projectToolCard(
      entity ?? { sessionId: state.sessionId, callId, executionState: "unknown" },
      state.childRuns,
    );
    cards.set(callId, card);
    return card;
  };
  const rows = state.rows.map<DisplayRow>((row) => {
    if (row.kind === "turn")
      return {
        kind: "turn",
        turn: {
          ...row.turn,
          blocks: row.turn.blocks.map((block, index) =>
            block.kind === "toolGroup"
              ? projectGroup(block, getCard)
              : block.kind === "thinking"
                ? projectThinking(block, row.turn.id, index)
                : block,
          ),
          summary: row.turn.summary
            ? {
                ...row.turn.summary,
                thinking: row.turn.summary.thinking.map((block, index) =>
                  projectThinking(block, `${row.turn.id}:summary`, index),
                ),
              }
            : null,
        },
      };
    if (row.kind === "unresolved")
      return { kind: "unresolved", id: row.id, callId: row.callId, card: getCard(row.callId) };
    if (row.kind === "unmatched") return { ...row, toolName: nonBlank(row.toolName) ? row.toolName : "tool" };
    return row;
  });
  return { rows, ...(options.contextTokens !== undefined ? { contextTokens: options.contextTokens } : {}) };
}

/** Returns the latest committed usage total, without falling back to earlier usage. */
export function getTranscriptContextTokens(
  messages: readonly { readonly usage?: { readonly totalTokens?: number; readonly total?: number } }[],
): number | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const usage = messages[index]?.usage;
    if (!usage) continue;
    const total = usage.totalTokens ?? usage.total;
    return total !== undefined && Number.isFinite(total) ? total : undefined;
  }
  return undefined;
}

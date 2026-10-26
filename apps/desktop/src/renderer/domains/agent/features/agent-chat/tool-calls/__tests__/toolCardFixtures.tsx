// Test-only fixtures. Do not import from production code or export from an index.
import type { AgentToolCallLifecycleState } from "@renderer/domains/agent/chat/agentChatSubagents";
import type { AgentContentBlock, AgentMessage } from "@renderer/domains/agent/chat/agentChatTypes";
import { projectToolCard } from "@renderer/domains/agent/chat/transcript/presentation";
import type { ToolCardModel } from "@renderer/domains/agent/chat/transcript/presentation.types";
import type {
  ToolCallEntity,
  ToolCallSource,
  ToolExecutionState,
} from "@renderer/domains/agent/chat/transcript/toolCalls.types";

import { AgentToolCallCard } from "../AgentToolCallCard";
import type { AgentToolCallCardProps } from "../summary";

/** Test-only protocol input for historical card visual assertions. */
type ToolCardFixtureInput = {
  toolCall: Extract<AgentContentBlock, { type: "toolCall" }>;
  result?: AgentMessage | null;
  agentLifecycleState?: AgentToolCallLifecycleState;
};

function terminalState(status: unknown): ToolExecutionState | undefined {
  if (status === "completed") return "succeeded";
  if (status === "failed" || status === "error") return "failed";
  if (status === "cancelled" || status === "canceled") return "interrupted";
  return undefined;
}

/** Builds real projected card input for tests only; never used by production UI. */
export function projectToolCardFixture({ toolCall, result, agentLifecycleState }: ToolCardFixtureInput): ToolCardModel {
  const source: ToolCallSource = {
    id: toolCall.id,
    origin: agentLifecycleState === "preparing" ? "live" : "snapshot",
    isFinal: true,
    priority: 0,
  };
  const isAgent = toolCall.name === "Agent";
  const terminal = isAgent ? terminalState(result?.details?.status) : undefined;
  const executionState: ToolExecutionState =
    terminal ??
    (result?.isError
      ? "failed"
      : agentLifecycleState === "running"
        ? "running"
        : agentLifecycleState === "completed" || (result && result.details?.mode !== "background")
          ? "succeeded"
          : "unknown");
  const childSessionId = result?.details?.sessionId;
  const hasTerminalChild =
    isAgent && terminal !== undefined && typeof childSessionId === "string" && !!childSessionId.trim();
  const entity: ToolCallEntity = {
    sessionId: "legacy",
    callId: toolCall.id,
    executionState,
    owner: { name: toolCall.name, arguments: toolCall.arguments, source },
    ...(isAgent &&
    !terminal &&
    agentLifecycleState !== "running" &&
    agentLifecycleState !== "completed" &&
    (agentLifecycleState === "queued" || result?.details?.mode === "background")
      ? { dispatchState: "accepted" }
      : {}),
    ...(hasTerminalChild
      ? {
          children: new Map([
            [
              childSessionId,
              {
                childSessionId,
                event: "completed",
                state: terminal,
                isComplete: true,
                source,
              },
            ],
          ]),
        }
      : {}),
    ...(result
      ? {
          result: {
            source,
            ...(result.isError ? { outcome: "failed" as const } : {}),
            content: {
              availability: "available",
              completeness: "unknown",
              text:
                typeof result.content === "string"
                  ? result.content
                  : Array.isArray(result.content)
                    ? result.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n")
                    : "",
              ...(result.details ? { details: result.details } : {}),
            },
          },
        }
      : {}),
  };
  const agentId = result?.details?.agentId;
  const childRuns = hasTerminalChild
    ? new Map([
        [
          childSessionId,
          {
            childSessionId,
            parentCallId: toolCall.id,
            event: "completed" as const,
            state: terminal,
            isComplete: true,
            source,
            ...(typeof agentId === "string" && agentId.trim() ? { agentId } : {}),
          },
        ],
      ])
    : undefined;
  return projectToolCard(entity, childRuns);
}

/** Test-only wrapper preserving historical card visual inputs and assertions. */
export function ToolCardFixture({
  workspacePath,
  onOpenCompletedSubagent,
  ...legacy
}: ToolCardFixtureInput & Pick<AgentToolCallCardProps, "workspacePath" | "onOpenCompletedSubagent">) {
  return (
    <AgentToolCallCard
      {...projectToolCardFixture(legacy)}
      workspacePath={workspacePath}
      onOpenCompletedSubagent={onOpenCompletedSubagent}
    />
  );
}

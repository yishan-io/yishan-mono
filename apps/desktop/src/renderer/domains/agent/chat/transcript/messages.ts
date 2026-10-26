import { projectSubagentCompletion } from "../agentChatCompletion";
import type { AgentMessage } from "../agentChatTypes";
import type { ToolCallOperation, ToolCallSource } from "./toolCalls.types";
import type { ContentObservation, TranscriptSnapshot, TranscriptSource } from "./types";

/** Normalized message with caller-owned identity, authority and independent streaming state. */
export type AgentMessageInput = {
  readonly message: AgentMessage;
  readonly source: TranscriptSource;
  readonly toolSource: ToolCallSource;
  readonly isStreaming: boolean;
};

/** Caller-owned ordering for a complete current message window; no revisions are inferred. */
export type AgentMessagesInput = Pick<
  TranscriptSnapshot,
  "sessionId" | "generation" | "update" | "authority" | "isWorking"
> & { readonly messages: readonly AgentMessageInput[] };

/** Identifies an unmapped input without retaining raw payloads or inventing a call ID. */
export type MessageAdapterDiagnostic = {
  readonly code: "missingToolCallId";
  readonly messageIndex: number;
};

/** Pure adapter output; unmatched rows retain bodies while diagnostics trace missing identities. */
export type AdaptedAgentMessages = {
  readonly snapshot: TranscriptSnapshot;
  readonly diagnostics: readonly MessageAdapterDiagnostic[];
  readonly hasMoreDiagnostics: boolean;
};

const MAX_ADAPTER_DIAGNOSTICS = 20;

/** Adapts normalized Pi messages only; does not validate or admit raw ingress payloads. */
export function adaptAgentMessages(input: AgentMessagesInput): AdaptedAgentMessages {
  const observations: TranscriptSnapshot["observations"][number][] = [];
  const toolOperations: ToolCallOperation[] = [];
  const diagnostics: MessageAdapterDiagnostic[] = [];
  let hasMoreDiagnostics = false;
  for (const [messageIndex, entry] of input.messages.entries()) {
    const { message, source, toolSource, isStreaming } = entry;
    if (message.role === "user") {
      observations.push({ kind: "user", source, text: extractText(message.content), timestampMs: message.timestamp });
    } else if (message.role === "assistant") {
      const blocks: ContentObservation[] =
        typeof message.content === "string"
          ? [{ kind: "text", text: message.content }]
          : message.content.flatMap<ContentObservation>((block) => {
              if (block.type === "text") return [{ kind: "text", text: block.text }];
              if (block.type === "thinking")
                return [
                  {
                    kind: "thinking",
                    text: block.thinking,
                    signature:
                      typeof block.thinkingSignature === "object"
                        ? { ...block.thinkingSignature }
                        : block.thinkingSignature,
                  },
                ];
              toolOperations.push({
                type: "owner",
                sessionId: input.sessionId,
                callId: block.id,
                owner: { name: block.name, arguments: { ...block.arguments }, source: toolSource },
              });
              return [{ kind: "tool", callId: block.id }];
            });
      if (
        message.stopReason === "error" &&
        message.errorMessage?.trim() &&
        !blocks.some((block) => block.kind === "tool" || block.text.trim().length > 0)
      )
        continue;
      observations.push({
        kind: "assistant",
        source,
        blocks,
        isStreaming,
        timestampMs: message.timestamp,
        startedAtMs: message.startedAtMs,
        durationMs: message.durationMs,
      });
    } else if (message.role === "toolResult") {
      if (!message.toolCallId?.trim()) {
        if (diagnostics.length < MAX_ADAPTER_DIAGNOSTICS) diagnostics.push({ code: "missingToolCallId", messageIndex });
        else hasMoreDiagnostics = true;
        observations.push({
          kind: "unmatched",
          source,
          text: extractText(message.content),
          isError: message.isError === true,
          ...(message.toolName !== undefined ? { toolName: message.toolName } : {}),
          ...(message.details !== undefined ? { details: { ...message.details } } : {}),
        });
        continue;
      }
      const text = extractText(message.content);
      toolOperations.push({
        type: "result",
        sessionId: input.sessionId,
        callId: message.toolCallId,
        result: {
          ...(message.toolName !== undefined ? { toolName: message.toolName } : {}),
          source: toolSource,
          // Normalized Pi toolResult is terminal; content/finality do not determine success.
          outcome: message.isError === true ? "failed" : "succeeded",
          content:
            text.length || message.details !== undefined
              ? {
                  availability: "available",
                  completeness: "unknown",
                  ...(text.length ? { text } : {}),
                  ...(message.details !== undefined ? { details: { ...message.details } } : {}),
                }
              : { availability: "missing" },
        },
      });
      // Composer resolves this reference only when a visible owner exists.
      observations.push({ kind: "unresolved", source, callId: message.toolCallId });
    } else if (message.role === "custom") {
      const completion = projectSubagentCompletion(message);
      if (completion)
        observations.push({
          kind: "completion",
          source,
          completion: {
            ...(completion.sessionId !== undefined ? { childSessionId: completion.sessionId } : {}),
            agentId: completion.agentId,
            agentName: completion.agentName,
            text: extractText(message.content),
            outcome:
              completion.status === "completed"
                ? "succeeded"
                : completion.status === "failed"
                  ? "failed"
                  : "interrupted",
          },
        });
    }
  }
  return {
    snapshot: {
      sessionId: input.sessionId,
      generation: input.generation,
      update: input.update,
      authority: input.authority,
      isWorking: input.isWorking,
      observations,
      toolOperations,
    },
    diagnostics,
    hasMoreDiagnostics,
  };
}

function extractText(content: AgentMessage["content"]): string {
  return typeof content === "string"
    ? content
    : content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("\n");
}

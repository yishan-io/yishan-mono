import type { AgentMessage } from "./agentChatTypes";

/** The fixed delegation roles exposed by the DSH runtime. */
export type DshDelegationRole = "explore" | "builder";
/** Display state of a DSH fixed-delegation transcript card. */
export type DshDelegationState = "queued" | "running" | "completed" | "aborted" | "error";

/** A validated terminal lifecycle state indexed by its durable child session. */
export type DshDelegationDiagnostic = {
  reason: "aborted" | "error" | "max-tokens" | "refusal";
};

/** A validated terminal lifecycle state indexed by its durable child session. */
export type DshDelegationLifecycleState = {
  childSessionId: string;
  state: Exclude<DshDelegationState, "queued" | "running">;
  diagnostic?: DshDelegationDiagnostic;
};

/** Metadata projected from a valid DSH delegation tool-result record. */
export type DshDelegationMetadata = { childSessionId: string };

/** Resolves fixed delegation calls using only structured result metadata and lifecycle state. */
export function resolveDshDelegationStates(
  messages: AgentMessage[],
  lifecycleByChildSessionId: ReadonlyMap<string, DshDelegationLifecycleState>,
): Map<string, DshDelegationState> {
  const states = new Map<string, DshDelegationState>();
  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type !== "toolCall") continue;
      const role = getDshDelegationRole(block.name);
      if (!role) continue;
      const result = messages.find((candidate) => candidate.role === "toolResult" && candidate.toolCallId === block.id);
      if (!result) {
        states.set(block.id, "queued");
        continue;
      }
      const metadata = getDshDelegationMetadata(result);
      if (result.isError || !metadata) {
        states.set(block.id, "error");
        continue;
      }
      states.set(block.id, lifecycleByChildSessionId.get(metadata.childSessionId)?.state ?? "running");
    }
  }
  return states;
}

/** Resolves durable terminal diagnostics using only structured delegation metadata. */
export function resolveDshDelegationDiagnostics(
  messages: AgentMessage[],
  lifecycleByChildSessionId: ReadonlyMap<string, DshDelegationLifecycleState>,
): Map<string, DshDelegationDiagnostic> {
  const diagnostics = new Map<string, DshDelegationDiagnostic>();
  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.content)) continue;
    for (const block of message.content) {
      if (block.type !== "toolCall" || !getDshDelegationRole(block.name)) continue;
      const result = messages.find((candidate) => candidate.role === "toolResult" && candidate.toolCallId === block.id);
      const metadata = result && getDshDelegationMetadata(result);
      const diagnostic = metadata && lifecycleByChildSessionId.get(metadata.childSessionId)?.diagnostic;
      if (diagnostic) diagnostics.set(block.id, diagnostic);
    }
  }
  return diagnostics;
}

/** Recovers terminal lifecycle entries from bounded durable DSH settlement records. */
export function recoverDshDelegationLifecycle(events: readonly unknown[]): Record<string, DshDelegationLifecycleState> {
  const lifecycleByChildSessionId: Record<string, DshDelegationLifecycleState> = {};
  for (const event of events) {
    if (!isRecord(event) || event.type !== "yishan/subagent-settled.v1" || !isRecord(event.data)) continue;
    const settlement = event.data;
    const { version, childSessionId, state } = settlement;
    const diagnostic = getDshDelegationDiagnostic(settlement.diagnostic);
    if (
      version !== 1 ||
      typeof childSessionId !== "string" ||
      !childSessionId ||
      (state !== "completed" && state !== "aborted" && state !== "error")
    )
      continue;
    lifecycleByChildSessionId[childSessionId] = {
      childSessionId,
      state,
      ...(diagnostic === null ? {} : { diagnostic }),
    };
  }
  return lifecycleByChildSessionId;
}

/** Returns a fixed delegation role only for the two supported tool names. */
export function getDshDelegationRole(toolName: string): DshDelegationRole | null {
  if (toolName === "delegate_explore") return "explore";
  if (toolName === "delegate_builder") return "builder";
  return null;
}

/** Reads previously validated DSH delegation metadata from a projected result. */
export function getDshDelegationMetadata(message: AgentMessage): DshDelegationMetadata | null {
  const metadata = message.details?.dshDelegation;
  if (!isRecord(metadata) || typeof metadata.childSessionId !== "string" || !metadata.childSessionId) return null;
  return { childSessionId: metadata.childSessionId };
}

function getDshDelegationDiagnostic(value: unknown): DshDelegationDiagnostic | null {
  if (!isRecord(value)) return null;
  const reason = value.reason;
  if (reason !== "aborted" && reason !== "error" && reason !== "max-tokens" && reason !== "refusal") return null;
  return { reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

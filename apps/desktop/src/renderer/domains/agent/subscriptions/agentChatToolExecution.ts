import type { ToolExecutionObservation } from "../state/agentChatStoreExecution";
import { isRecord } from "./agentChatInboundMessage";

/** Maximum accepted Pi call identifier length, in UTF-16 code units. */
export const MAX_EXECUTION_CALL_ID_LENGTH = 1024;
/** Maximum accepted Pi tool name length, in UTF-16 code units. */
export const MAX_EXECUTION_TOOL_NAME_LENGTH = 256;

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length <= maximum && value.trim().length > 0;
}

/** Reads execution identity/outcome only; arbitrary result and argument objects remain untouched. */
export function parseToolExecution(event: unknown): ToolExecutionObservation | null {
  if (!isRecord(event) || "parentToolCallId" in event) return null;
  if (
    !isBoundedString(event.toolCallId, MAX_EXECUTION_CALL_ID_LENGTH) ||
    !isBoundedString(event.toolName, MAX_EXECUTION_TOOL_NAME_LENGTH)
  )
    return null;
  let state: ToolExecutionObservation["state"];
  switch (event.type) {
    case "tool_execution_start":
    case "tool_execution_update":
      state = "running";
      break;
    case "tool_execution_end":
      if (typeof event.isError !== "boolean") return null;
      state = event.isError ? "failed" : "succeeded";
      break;
    default:
      return null;
  }
  return { callId: event.toolCallId, name: event.toolName, state };
}

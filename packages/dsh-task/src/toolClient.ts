import type { CapabilityIdentity, CapabilityTransport } from "@yishan-io/dsh-daemon-bridge";

import { type TaskCapabilityRequest, TaskClient } from "./client";

export type TaskToolExecution = { agent?: { id: string }; signal: AbortSignal };

export function createTaskClient(
  transport: CapabilityTransport<TaskCapabilityRequest>,
  resolveIdentity: (sessionId: string) => CapabilityIdentity,
  execution: TaskToolExecution,
): TaskClient {
  const sessionId = execution.agent?.id;
  if (sessionId === undefined) throw new Error("task tools require an agent-scoped execution");
  return new TaskClient(transport, resolveIdentity(sessionId), execution.signal);
}

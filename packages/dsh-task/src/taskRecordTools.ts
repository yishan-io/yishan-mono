import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { CapabilityIdentity, CapabilityTransport } from "@yishan-io/dsh-daemon-bridge";

import type { TaskCapabilityRequest } from "./client";
import type { LocalTask } from "./protocol";
import { createTaskClient } from "./toolClient";
import {
  taskListOutput,
  taskListParameters,
  taskResultOutput,
  taskSearchOutput,
  taskSearchParameters,
  taskStartParameters,
  taskUpdateParameters,
} from "./toolSchemas";

export function registerTaskRecordTools(
  context: Context,
  transport: CapabilityTransport<TaskCapabilityRequest>,
  resolveIdentity: (sessionId: string) => CapabilityIdentity,
): void {
  context.tools.register(
    defineTool({
      name: "task_start",
      description: "Create a Local Task in the current project scope.",
      parameters: taskStartParameters,
      output: textOutput(taskResultOutput, (value) => `Started task ${(value as LocalTask).id}.`),
      async execute(arguments_, execution) {
        return await createTaskClient(transport, resolveIdentity, execution).start(arguments_);
      },
    }),
  );
  context.tools.register(
    defineTool({
      name: "task_list",
      description: "List Local Tasks in the current project scope.",
      parameters: taskListParameters,
      output: textOutput(taskListOutput, (value) => formatTaskList((value as { tasks: LocalTask[] }).tasks)),
      async execute(arguments_, execution) {
        return await createTaskClient(transport, resolveIdentity, execution).list(arguments_);
      },
    }),
  );
  context.tools.register(
    defineTool({
      name: "task_search",
      description: "Search Local Tasks in the current project scope.",
      parameters: taskSearchParameters,
      output: textOutput(taskSearchOutput, (value) => formatTaskList((value as { tasks: LocalTask[] }).tasks)),
      async execute(arguments_, execution) {
        return await createTaskClient(transport, resolveIdentity, execution).search(arguments_);
      },
    }),
  );
  context.tools.register(
    defineTool({
      name: "task_update",
      description: "Update Local Task metadata. Use task_finish to mark done.",
      parameters: taskUpdateParameters,
      output: textOutput(taskResultOutput, (value) => `Updated task ${(value as LocalTask).id}.`),
      async execute(arguments_, execution) {
        return await createTaskClient(transport, resolveIdentity, execution).update(arguments_);
      },
    }),
  );
}

function formatTaskList(tasks: LocalTask[]): string {
  return tasks.map((task) => `${task.id} — ${task.status} — ${task.title}`).join("\n") || "No tasks found.";
}

function textOutput<const T>(schema: T, render: (value: unknown) => string) {
  return { schema, render: (_arguments: unknown, value: unknown) => [{ type: "text" as const, text: render(value) }] };
}

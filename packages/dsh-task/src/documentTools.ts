import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { CapabilityIdentity, CapabilityTransport } from "@yishan-io/dsh-daemon-bridge";

import type { TaskCapabilityRequest } from "./client";
import type { LocalTask, TaskReadResult } from "./protocol";
import { createTaskClient } from "./toolClient";
import {
  taskAppendNoteParameters,
  taskFinishParameters,
  taskReadOutput,
  taskReadParameters,
  taskWriteOutput,
  taskWriteParameters,
} from "./toolSchemas";

export function registerTaskDocumentTools(
  context: Context,
  transport: CapabilityTransport<TaskCapabilityRequest>,
  resolveIdentity: (sessionId: string) => CapabilityIdentity,
): void {
  context.tools.register(
    defineTool({
      name: "task_read",
      description: "Read synthetic task metadata or a daemon-derived context document.",
      parameters: taskReadParameters,
      output: textOutput(taskReadOutput, (value) => renderTaskRead(value as TaskReadResult)),
      async execute(arguments_, execution) {
        return await createTaskClient(transport, resolveIdentity, execution).read(arguments_);
      },
    }),
  );
  context.tools.register(
    defineTool({
      name: "task_write",
      description: "Replace a daemon-derived plan, notes, or outcome document.",
      parameters: taskWriteParameters,
      output: textOutput(taskWriteOutput, (value) => {
        const result = value as { id: string; document: string };
        return `Wrote ${result.document}.md for task ${result.id}.`;
      }),
      async execute(arguments_, execution) {
        return await createTaskClient(transport, resolveIdentity, execution).write(arguments_);
      },
    }),
  );
  context.tools.register(
    defineTool({
      name: "task_append_note",
      description: "Append content to a daemon-derived task notes document.",
      parameters: taskAppendNoteParameters,
      output: textOutput(taskWriteOutput, (value) => `Appended a note to task ${(value as { id: string }).id}.`),
      async execute(arguments_, execution) {
        return await createTaskClient(transport, resolveIdentity, execution).appendNote(arguments_);
      },
    }),
  );
  context.tools.register(
    defineTool({
      name: "task_finish",
      description: "Write the outcome, then mark a Local Task done.",
      parameters: taskFinishParameters,
      output: textOutput(taskWriteOutput, (value) => `Finished task ${(value as { id: string }).id}.`),
      async execute(arguments_, execution) {
        return await createTaskClient(transport, resolveIdentity, execution).finish(arguments_);
      },
    }),
  );
}

function renderTaskRead(result: TaskReadResult): string {
  if (result.document !== "task") return result.content;
  return formatTaskBrief(result.task);
}

function formatTaskBrief(task: LocalTask): string {
  const tags = task.tags.length === 0 ? "none" : task.tags.join(", ");
  return [
    `# ${task.title}`,
    "",
    `**ID:** ${task.id}`,
    `**Project:** ${task.projectId ?? "global"}`,
    `**Created:** ${task.createdAt}`,
    `**Updated:** ${task.updatedAt}`,
    `**Status:** ${task.status}`,
    `**Priority:** ${task.priority}`,
    `**Tags:** ${tags}`,
    "",
    "## Description",
    "",
    task.description || "No description provided.",
    "",
  ].join("\n");
}

function textOutput<const T>(schema: T, render: (value: unknown) => string) {
  return { schema, render: (_arguments: unknown, value: unknown) => [{ type: "text" as const, text: render(value) }] };
}

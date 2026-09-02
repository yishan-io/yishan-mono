import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type { CapabilityIdentity, CapabilityTransport } from "@yishan-io/dsh-daemon-bridge";

import type { TaskCapabilityRequest } from "./client";
import type { TaskTemplatesResult } from "./protocol";

type TaskTemplateToolResult = { agentDefaultId: string; template?: TaskTemplatesResult["templates"][number] };
import { createTaskClient } from "./toolClient";
import { taskTemplatesOutput } from "./toolSchemas";

export function registerTaskTemplateTool(
  context: Context,
  transport: CapabilityTransport<TaskCapabilityRequest>,
  resolveIdentity: (sessionId: string) => CapabilityIdentity,
): void {
  context.tools.register(
    defineTool({
      name: "task_template_read",
      description: "Read the Agent default task description template structure.",
      parameters: {},
      output: {
        schema: taskTemplatesOutput,
        render(_arguments, value) {
          return [{ type: "text", text: renderTemplate(value as TaskTemplateToolResult) }];
        },
      },
      async execute(_arguments, execution) {
        const result = await createTaskClient(transport, resolveIdentity, execution).templateRead();
        const template =
          result.templates.find((candidate) => candidate.id === result.agentDefaultId) ?? result.templates[0];
        return { agentDefaultId: result.agentDefaultId, ...(template === undefined ? {} : { template }) };
      },
    }),
  );
}

function renderTemplate(result: TaskTemplateToolResult): string {
  if (result.template === undefined) return "No task templates available.";
  return `Agent default template: ${result.template.name}\n\n${result.template.content}`;
}

import exploreAgentMarkdown from "../../../../../../packages/pi-subagents/agents/Explore.md?raw";
import generalAgentMarkdown from "../../../../../../packages/pi-subagents/agents/General.md?raw";
import builderAgentMarkdown from "../../../../../../packages/pi-subagents/agents/builder.md?raw";
import codeReviewerAgentMarkdown from "../../../../../../packages/pi-subagents/agents/code-reviewer.md?raw";
import planReviewerAgentMarkdown from "../../../../../../packages/pi-subagents/agents/plan-reviewer.md?raw";
import taskReviewerAgentMarkdown from "../../../../../../packages/pi-subagents/agents/task-reviewer.md?raw";
import type { RichComposerSlashCommand } from "../../components/RichComposer";

const SUBAGENT_DEFINITION_MARKDOWNS = [
  builderAgentMarkdown,
  codeReviewerAgentMarkdown,
  exploreAgentMarkdown,
  generalAgentMarkdown,
  planReviewerAgentMarkdown,
  taskReviewerAgentMarkdown,
];

function parseFrontmatterField(markdown: string, fieldName: "name" | "description"): string {
  const match = markdown.match(new RegExp(`^${fieldName}:\\s*(.+)$`, "mi"));
  return match?.[1]?.trim() ?? "";
}

/** Builds slash commands from the packaged Pi sub-agent definitions. */
export function buildSubagentSlashCommands(): RichComposerSlashCommand[] {
  return SUBAGENT_DEFINITION_MARKDOWNS.map((markdown) => {
    const name = parseFrontmatterField(markdown, "name");
    const description = parseFrontmatterField(markdown, "description");

    return {
      id: `agent:${name}`,
      category: "agent" as const,
      title: `/${name}`,
      description,
      searchText: name,
    };
  }).sort((leftCommand, rightCommand) => leftCommand.title.localeCompare(rightCommand.title));
}

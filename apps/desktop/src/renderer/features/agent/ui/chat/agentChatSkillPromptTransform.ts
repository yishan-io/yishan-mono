import type { RichComposerSlashCommand } from "./composer/RichComposer";

const LEADING_SKILL_COMMAND_REGEX = /^\/([a-zA-Z][\w-]*)(?=\s|$)([\s\S]*)$/;

/** Converts a leading skill slash command into pi's native /skill: expansion form before send. */
export async function transformAgentChatPromptForSkills(
  prompt: string,
  slashCommands: RichComposerSlashCommand[],
): Promise<string> {
  const trimmedPrompt = prompt.trim();
  const match = trimmedPrompt.match(LEADING_SKILL_COMMAND_REGEX);
  if (!match) {
    return trimmedPrompt;
  }

  const skillName = match[1];
  const trailingContent = match[2] ?? "";
  if (!skillName) {
    return trimmedPrompt;
  }

  const matchingSkillCommand = slashCommands.find(
    (command) => command.category === "skill" && (command.insertText ?? command.title) === `/${skillName}`,
  );
  if (!matchingSkillCommand) {
    return trimmedPrompt;
  }

  const normalizedTrailingContent = trailingContent.trim();
  return normalizedTrailingContent ? `/skill:${skillName} ${normalizedTrailingContent}` : `/skill:${skillName}`;
}

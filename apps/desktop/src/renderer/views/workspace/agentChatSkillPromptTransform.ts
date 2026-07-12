import { getSkillDetail } from "../../commands/skillCommands";
import type { RichComposerSlashCommand } from "../../components/RichComposer";

const cachedSkillPromptByName = new Map<string, Promise<string | null>>();
const LEADING_SKILL_COMMAND_REGEX = /^\/([a-zA-Z][\w-]*)(?=\s|$)([\s\S]*)$/;

function buildSkillPromptMessage(skillName: string, skillMarkdown: string): string {
  return `<skill name="${skillName}">\n${skillMarkdown.trim()}\n</skill>`;
}

async function loadSkillPromptMessage(skillName: string): Promise<string | null> {
  const detail = await getSkillDetail(skillName);
  const skillMarkdown = detail.files["SKILL.md"]?.trim();
  if (!skillMarkdown) {
    return null;
  }
  return buildSkillPromptMessage(skillName, skillMarkdown);
}

/** Loads one skill prompt payload once and reuses it across agent-chat submissions. */
export async function getCachedSkillPromptMessage(skillName: string): Promise<string | null> {
  const normalizedSkillName = skillName.trim();
  if (!normalizedSkillName) {
    return null;
  }

  const cachedPrompt = cachedSkillPromptByName.get(normalizedSkillName);
  if (cachedPrompt) {
    return cachedPrompt;
  }

  const nextPrompt = loadSkillPromptMessage(normalizedSkillName).catch(() => null);
  cachedSkillPromptByName.set(normalizedSkillName, nextPrompt);
  return nextPrompt;
}

/** Converts a leading skill slash command into the injected `<skill ...>` prompt format before send. */
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

  const skillPromptMessage = await getCachedSkillPromptMessage(skillName);
  if (!skillPromptMessage) {
    return trimmedPrompt;
  }

  const normalizedTrailingContent = trailingContent.trim();
  return normalizedTrailingContent ? `${skillPromptMessage}\n\n${normalizedTrailingContent}` : skillPromptMessage;
}

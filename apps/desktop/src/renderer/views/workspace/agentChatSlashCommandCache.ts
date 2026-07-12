import { listSkills } from "../../commands/skillCommands";
import type { RichComposerSlashCommand } from "../../components/RichComposer";
import type { SkillInfo } from "../../rpc/daemonTypes";
import { buildSubagentSlashCommands } from "./agentChatSlashCommandCatalog";

const SUBAGENT_SLASH_COMMANDS = buildSubagentSlashCommands();

let cachedSlashCommands: RichComposerSlashCommand[] | null = null;
let slashCommandsLoadPromise: Promise<RichComposerSlashCommand[]> | null = null;

function buildSkillSlashCommands(skills: SkillInfo[]): RichComposerSlashCommand[] {
  return [...skills]
    .sort((leftSkill, rightSkill) => leftSkill.name.localeCompare(rightSkill.name))
    .map((skill) => ({
      id: `skill:${skill.name}`,
      category: "skill" as const,
      title: `/${skill.name}`,
      description: skill.description,
      searchText: skill.name,
    }));
}

/** Returns cached agent chat slash commands when already loaded in this renderer process. */
export function getCachedAgentChatSlashCommands(): RichComposerSlashCommand[] | null {
  return cachedSlashCommands;
}

/** Loads agent chat slash commands once and shares the result across chat tabs. */
export async function loadAgentChatSlashCommands(): Promise<RichComposerSlashCommand[]> {
  if (cachedSlashCommands) {
    return cachedSlashCommands;
  }

  if (slashCommandsLoadPromise) {
    return slashCommandsLoadPromise;
  }

  slashCommandsLoadPromise = listSkills()
    .catch(() => [])
    .then((skills) => {
      const slashCommands = [...buildSkillSlashCommands(skills), ...SUBAGENT_SLASH_COMMANDS];
      cachedSlashCommands = slashCommands;
      slashCommandsLoadPromise = null;
      return slashCommands;
    });

  return slashCommandsLoadPromise;
}

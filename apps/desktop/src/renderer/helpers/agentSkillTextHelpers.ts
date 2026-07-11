const FULL_SKILL_MESSAGE_REGEX = /^\s*<skill\b([^>]*)>[\s\S]*?<\/skill>([\s\S]*)$/i;
const SELF_CLOSING_SKILL_MESSAGE_REGEX = /^\s*<skill\b([^>]*)\/>\s*([\s\S]*)$/i;
const SKILL_NAME_ATTRIBUTE_REGEX = /\bname="([^"]+)"/i;
const LEADING_SLASH_COMMAND_REGEX = /^\/([a-z][\w-]*)(?:\s+([\s\S]*))?$/;
const MAX_AGENT_SESSION_TITLE_LENGTH = 40;

export type ParsedSkillMessage = {
  skillName: string;
  trailingContent: string;
};

function extractSkillName(attributes: string): string | null {
  return attributes.match(SKILL_NAME_ATTRIBUTE_REGEX)?.[1]?.trim() ?? null;
}

function normalizeSessionText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Parses a leading injected skill XML block and preserves any trailing user content. */
export function parseSkillMessage(messageText: string): ParsedSkillMessage | null {
  const fullMatch = messageText.match(FULL_SKILL_MESSAGE_REGEX);
  if (fullMatch) {
    const attributes = fullMatch[1] ?? "";
    const skillName = extractSkillName(attributes);
    if (!skillName) {
      return null;
    }
    return {
      skillName,
      trailingContent: fullMatch[2]?.trim() ?? "",
    };
  }

  const selfClosingMatch = messageText.match(SELF_CLOSING_SKILL_MESSAGE_REGEX);
  if (!selfClosingMatch) {
    return null;
  }

  const attributes = selfClosingMatch[1] ?? "";
  const skillName = extractSkillName(attributes);
  if (!skillName) {
    return null;
  }

  return {
    skillName,
    trailingContent: selfClosingMatch[2]?.trim() ?? "",
  };
}

/** Normalizes raw session preview text into one concise title without XML wrappers or slash syntax. */
export function normalizeAgentSessionTitle(messageText: string): string {
  const parsedSkillMessage = parseSkillMessage(messageText);
  if (parsedSkillMessage) {
    return normalizeSessionText(parsedSkillMessage.trailingContent) || `use skill: ${parsedSkillMessage.skillName}`;
  }

  const normalizedMessageText = messageText.trim();
  const slashCommandMatch = normalizedMessageText.match(LEADING_SLASH_COMMAND_REGEX);
  if (slashCommandMatch) {
    return normalizeSessionText(slashCommandMatch[2] ?? "") || (slashCommandMatch[1] ?? "");
  }

  return normalizeSessionText(normalizedMessageText);
}

/** Formats one agent-chat tab title from raw session text. */
export function formatAgentSessionTitle(messageText: string, fallbackTitle = "Agent Chat"): string {
  const normalizedTitle = normalizeAgentSessionTitle(messageText) || fallbackTitle;
  if (normalizedTitle.length <= MAX_AGENT_SESSION_TITLE_LENGTH) {
    return normalizedTitle;
  }
  return `${normalizedTitle.slice(0, MAX_AGENT_SESSION_TITLE_LENGTH)}…`;
}

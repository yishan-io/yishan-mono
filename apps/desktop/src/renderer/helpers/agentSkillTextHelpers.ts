const FULL_SKILL_MESSAGE_REGEX = /^\s*<skill\b([^>]*)>[\s\S]*?<\/skill>([\s\S]*)$/i;
const SELF_CLOSING_SKILL_MESSAGE_REGEX = /^\s*<skill\b([^>]*)\/>\s*([\s\S]*)$/i;
const SKILL_NAME_ATTRIBUTE_REGEX = /\bname="([^"]+)"/i;
const LEADING_SKILL_COMMAND_REGEX = /^\s*\/skill:([a-zA-Z][\w-]*)(?:\s+([\s\S]*))?$/i;
const LEADING_SLASH_COMMAND_REGEX = /^\/([a-z][\w-]*)(?:\s+([\s\S]*))?$/;
const MAX_AGENT_SESSION_TITLE_LENGTH = 40;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** Parses a leading skill command or injected skill XML block and preserves any trailing user content. */
export function parseSkillMessage(messageText: string): ParsedSkillMessage | null {
  const skillCommandMatch = messageText.match(LEADING_SKILL_COMMAND_REGEX);
  if (skillCommandMatch) {
    return {
      skillName: skillCommandMatch[1] ?? "",
      trailingContent: skillCommandMatch[2]?.trim() ?? "",
    };
  }

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

/** Returns true when the string looks like an auto-generated UUID (not a user-set name). */
function isUuidName(name: string): boolean {
  return UUID_REGEX.test(name.trim());
}

/** Formats one agent-chat tab title from raw session text. When sessionName is provided, non-empty, and not a UUID, it is used directly (user-renamed session). UUID names and empty names fall back to messageText. */
export function formatAgentSessionTitle(
  messageText: string,
  fallbackTitle = "Agent Chat",
  sessionName?: string,
): string {
  const trimmedName = sessionName?.trim();
  if (trimmedName && !isUuidName(trimmedName)) {
    if (trimmedName.length <= MAX_AGENT_SESSION_TITLE_LENGTH) {
      return trimmedName;
    }
    return `${trimmedName.slice(0, MAX_AGENT_SESSION_TITLE_LENGTH)}…`;
  }
  const normalizedTitle = normalizeAgentSessionTitle(messageText) || fallbackTitle;
  if (normalizedTitle.length <= MAX_AGENT_SESSION_TITLE_LENGTH) {
    return normalizedTitle;
  }
  return `${normalizedTitle.slice(0, MAX_AGENT_SESSION_TITLE_LENGTH)}…`;
}

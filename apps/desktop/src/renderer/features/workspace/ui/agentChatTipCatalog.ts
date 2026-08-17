/**
 * i18n keys for agent-chat tips shown one at a time in the empty transcript state.
 * Add a new tip by appending its key here and a matching entry under
 * `agentChat.tips.*` in both `en/agentChat.json` and `zh/agentChat.json`.
 */
export const AGENT_CHAT_TIP_KEYS = [
  "agentChat.tips.planFirst",
  "agentChat.tips.mentionFiles",
  "agentChat.tips.slashSkills",
  "agentChat.tips.dragScope",
  "agentChat.tips.subagents",
  "agentChat.tips.explore",
  "agentChat.tips.codeReview",
  "agentChat.tips.planReview",
  "agentChat.tips.thinkingLevel",
  "agentChat.tips.compact",
  "agentChat.tips.voice",
  "agentChat.tips.history",
  "agentChat.tips.usage",
  "agentChat.tips.modelSwitch",
  "agentChat.tips.splitPane",
  "agentChat.tips.pasteBlock",
  "agentChat.tips.followUp",
  "agentChat.tips.failingTest",
] as const;

/** Prefix label rendered before each tip (e.g. "Tip:"). */
export const AGENT_CHAT_TIP_PREFIX_KEY = "agentChat.tips.prefix";

import type { AgentModel } from "../store/agentChatTypes";

/**
 * Thinking levels in pi's canonical order (pi-ai EXTENDED_THINKING_LEVELS).
 * Order matters: it is the cycling order and the SDK's clamp preference order.
 */
export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/**
 * Returns the thinking levels the given model supports, mirroring pi-ai's
 * getSupportedThinkingLevels exactly (the SDK clamps the requested level to
 * this list at session creation):
 * - non-reasoning models support only "off";
 * - a level is unsupported when `thinkingLevelMap[level] === null`;
 * - "xhigh"/"max" additionally require an explicit map entry;
 * - every other level is supported unless explicitly null.
 *
 * Missing data (no model, no map, unknown reasoning) is treated as supporting
 * the full list so callers never warn or block on absent capability info.
 * Note: pi-ai treats an absent `reasoning` field as non-reasoning; here an
 * absent field means "unknown" because daemon-sourced models (settings dialog)
 * may lack it — the safe direction is to not under-report support.
 */
export function getSupportedThinkingLevels(
  model: Pick<AgentModel, "reasoning" | "thinkingLevelMap"> | null | undefined,
): ThinkingLevel[] {
  if (!model) {
    return [...THINKING_LEVELS];
  }
  if (model.reasoning === false) {
    return ["off"];
  }

  const map = model.thinkingLevelMap;
  if (!map) {
    return [...THINKING_LEVELS];
  }

  return THINKING_LEVELS.filter((level) => {
    const mapped = map[level];
    if (mapped === null) {
      return false;
    }
    if (level === "xhigh" || level === "max") {
      return mapped !== undefined;
    }
    return true;
  });
}

/** Whether the given level is supported by the model (unknown data → true). */
export function isThinkingLevelSupported(
  level: string,
  model: Pick<AgentModel, "reasoning" | "thinkingLevelMap"> | null | undefined,
): boolean {
  return getSupportedThinkingLevels(model).includes(level as ThinkingLevel);
}

/**
 * Mirrors pi-ai clampThinkingLevel: maps an unsupported requested level to the
 * nearest supported one, walking UP first (so medium on a model that supports
 * only off/high/max becomes high). Used to preview what pi will actually run.
 */
export function clampThinkingLevel(
  level: string,
  model: Pick<AgentModel, "reasoning" | "thinkingLevelMap"> | null | undefined,
): ThinkingLevel {
  const supported = getSupportedThinkingLevels(model);
  const requestedIndex = THINKING_LEVELS.indexOf(level as ThinkingLevel);
  if (requestedIndex === -1) {
    return supported[0] ?? "off";
  }
  for (let index = requestedIndex; index < THINKING_LEVELS.length; index += 1) {
    const candidate = THINKING_LEVELS[index];
    if (candidate !== undefined && supported.includes(candidate)) {
      return candidate;
    }
  }
  for (let index = requestedIndex - 1; index >= 0; index -= 1) {
    const candidate = THINKING_LEVELS[index];
    if (candidate !== undefined && supported.includes(candidate)) {
      return candidate;
    }
  }
  return supported[0] ?? "off";
}

/** Compact display string, e.g. "off, high, max". */
export function formatSupportedThinkingLevels(
  model: Pick<AgentModel, "reasoning" | "thinkingLevelMap"> | null | undefined,
): string {
  return getSupportedThinkingLevels(model).join(", ");
}

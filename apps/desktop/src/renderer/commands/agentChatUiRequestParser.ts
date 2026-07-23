import type { AgentPendingUiOption, AgentPendingUiRequest } from "../store/agentChatTypes";
import { MAX_DETAILS_STRING_UTF8_BYTES, PER_MESSAGE_UTF8_BYTES, truncateUtf8Bytes } from "./agentChatInboundMessage";

// ─── Pending UI request parser ────────────────────────────────────────────────

const ASK_USER_FREEFORM_SENTINEL = "__ask_user_freeform__";
const MULTI_SELECT_INSTRUCTION = "Comma-separated selections by number or exact title";
const MULTI_SELECT_FREEFORM_HINT = "Type your own answer instead of selecting options";
const RPC_OPTION_DESCRIPTION_INDENT = "   ";

export function parsePendingUiRequest(event: Record<string, unknown>): AgentPendingUiRequest | null {
  const rawId = typeof event.id === "string" ? event.id : null;
  const id = rawId ? truncateUtf8Bytes(rawId, MAX_DETAILS_STRING_UTF8_BYTES) : null;
  const method = typeof event.method === "string" ? event.method : null;
  const rawTitle = typeof event.title === "string" ? event.title : null;

  if (!id || !rawTitle) {
    return null;
  }

  if (method !== "select" && method !== "confirm" && method !== "input" && method !== "editor") {
    return null;
  }

  const truncate = (s: string) => truncateUtf8Bytes(s, PER_MESSAGE_UTF8_BYTES);
  const optionStrings = Array.isArray(event.options)
    ? event.options.filter((option): option is string => typeof option === "string")
    : undefined;

  if (method === "select") {
    const allowFreeform = optionStrings?.includes(ASK_USER_FREEFORM_SENTINEL) ?? false;
    const normalizedOptions = (optionStrings ?? [])
      .filter((option) => option !== ASK_USER_FREEFORM_SENTINEL)
      .map((option) => ({ value: truncate(option), label: truncate(option) }));
    const parsedSelectPrompt = parseSelectPromptMetadata(rawTitle, normalizedOptions);

    return {
      id,
      method,
      title: truncate(parsedSelectPrompt?.question ?? rawTitle),
      message: typeof event.message === "string" ? truncate(event.message) : undefined,
      options: parsedSelectPrompt?.options ?? normalizedOptions,
      placeholder: typeof event.placeholder === "string" ? truncate(event.placeholder) : undefined,
      prefill: typeof event.prefill === "string" ? truncate(event.prefill) : undefined,
      allowFreeform,
      selectionMode: "single",
    };
  }

  if (method === "input") {
    const parsedMultiSelectPrompt = parseMultiSelectPromptMetadata(rawTitle);
    if (parsedMultiSelectPrompt) {
      return {
        id,
        method,
        title: truncate(parsedMultiSelectPrompt.question),
        message: typeof event.message === "string" ? truncate(event.message) : undefined,
        options: parsedMultiSelectPrompt.options,
        placeholder: typeof event.placeholder === "string" ? truncate(event.placeholder) : undefined,
        prefill: typeof event.prefill === "string" ? truncate(event.prefill) : undefined,
        allowFreeform: parsedMultiSelectPrompt.allowFreeform,
        selectionMode: "multiple",
      };
    }
  }

  return {
    id,
    method,
    title: truncate(rawTitle),
    message: typeof event.message === "string" ? truncate(event.message) : undefined,
    options: optionStrings?.map((option) => ({ value: truncate(option), label: truncate(option) })),
    placeholder: typeof event.placeholder === "string" ? truncate(event.placeholder) : undefined,
    prefill: typeof event.prefill === "string" ? truncate(event.prefill) : undefined,
  };
}

function parseSelectPromptMetadata(
  title: string,
  options: AgentPendingUiOption[],
): { question: string; options: AgentPendingUiOption[] } | null {
  if (options.length === 0) {
    return null;
  }

  const lines = title.split("\n");
  const firstOptionIndex = lines.findIndex((line) => line.trim() === `1. ${options[0]?.value}`);
  if (firstOptionIndex <= -1) {
    return null;
  }

  const parsedOptions = parsePromptOptions(lines.slice(firstOptionIndex));
  if (parsedOptions.length === 0 || !options.every((option, index) => parsedOptions[index]?.label === option.value)) {
    return null;
  }

  return {
    question: lines.slice(0, firstOptionIndex).join("\n").trim() || title,
    options: parsedOptions.map((option, index) => ({
      value: options[index]?.value ?? option.label,
      label: option.label,
      description: option.description,
    })),
  };
}

function parseMultiSelectPromptMetadata(
  title: string,
): { question: string; options: AgentPendingUiOption[]; allowFreeform: boolean } | null {
  if (!title.includes(MULTI_SELECT_INSTRUCTION)) {
    return null;
  }

  const lines = title.split("\n");
  const options = parsePromptOptions(lines);
  if (options.length === 0) {
    return null;
  }

  const instructionIndex = lines.findIndex((line) => line.trim() === MULTI_SELECT_INSTRUCTION);
  const allowFreeform = lines.some((line) => line.trim() === MULTI_SELECT_FREEFORM_HINT);
  const question = (instructionIndex <= -1 ? lines : lines.slice(0, instructionIndex))
    .filter(
      (line) =>
        !/^\d+\.\s+.+$/.test(line.trim()) &&
        !line.startsWith(RPC_OPTION_DESCRIPTION_INDENT) &&
        line.trim() !== MULTI_SELECT_FREEFORM_HINT,
    )
    .join("\n")
    .trim();

  return {
    question: question || title,
    options: options.map((option) => ({
      index: option.index,
      value: option.label,
      label: option.label,
      description: option.description,
    })),
    allowFreeform,
  };
}

function parsePromptOptions(lines: string[]): Array<{ index: number; label: string; description?: string }> {
  const parsedOptions: Array<{ index: number; label: string; description?: string }> = [];
  let activeOption: { index: number; label: string; description?: string } | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    const optionMatch = /^(?<index>\d+)\.\s+(?<label>.+)$/.exec(trimmedLine);
    if (optionMatch?.groups?.index && optionMatch.groups.label) {
      const index = Number.parseInt(optionMatch.groups.index, 10);
      if (!Number.isInteger(index) || index < 1) {
        continue;
      }

      activeOption = { index, label: optionMatch.groups.label };
      parsedOptions.push(activeOption);
      continue;
    }

    if (!activeOption || !line.startsWith(RPC_OPTION_DESCRIPTION_INDENT)) {
      continue;
    }

    const descriptionLine = line.trim();
    activeOption.description = activeOption.description
      ? `${activeOption.description}\n${descriptionLine}`
      : descriptionLine;
  }

  return parsedOptions;
}

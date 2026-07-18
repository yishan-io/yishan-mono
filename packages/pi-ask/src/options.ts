import type { AskOption, AskOptionInput } from "./types";

interface AskToolParamsLike {
  question: string;
  context?: string;
  options?: AskOptionInput[];
  allowMultiple?: boolean;
  allowFreeform?: boolean;
}

type LooseAskOptionRecord = {
  title?: unknown;
  description?: unknown;
};

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Converts a loosely-shaped option input into the canonical option format.
 */
export function normalizeAskOption(option: unknown): AskOption | null {
  if (typeof option === "string") {
    const title = normalizeOptionalString(option);
    return title ? { title } : null;
  }

  if (!option || typeof option !== "object") {
    return null;
  }

  const optionRecord = option as LooseAskOptionRecord;
  const title = normalizeOptionalString(optionRecord.title);
  if (!title) {
    return null;
  }

  const description = normalizeOptionalString(optionRecord.description);
  return description ? { title, description } : { title };
}

/**
 * Normalizes an array of ask_user options, filtering out invalid entries.
 */
export function normalizeAskOptions(options: unknown[] | undefined): AskOption[] {
  if (!options) {
    return [];
  }

  return options.map((option) => normalizeAskOption(option)).filter((option): option is AskOption => option !== null);
}

/**
 * Produces a validation-compatible parameter object before tool execution.
 */
export function normalizeAskToolParams(args: unknown): AskToolParamsLike {
  if (!args || typeof args !== "object") {
    return args as AskToolParamsLike;
  }

  const record = args as Record<string, unknown>;
  const normalizedOptions = Array.isArray(record.options)
    ? record.options
        .filter(
          (option): option is string | LooseAskOptionRecord =>
            typeof option === "string" || (option !== null && typeof option === "object"),
        )
        .reduce<AskOptionInput[]>((accumulator, option) => {
          if (typeof option === "string") {
            const normalizedString = normalizeOptionalString(option);
            if (normalizedString) {
              accumulator.push(normalizedString);
            }
            return accumulator;
          }

          const normalizedOption = normalizeAskOption(option);
          if (normalizedOption) {
            accumulator.push(normalizedOption);
          }
          return accumulator;
        }, [])
    : undefined;

  const question = normalizeOptionalString(record.question) ?? "";
  const context = normalizeOptionalString(record.context);

  return {
    question,
    ...(context ? { context } : {}),
    ...(typeof record.allowMultiple === "boolean" ? { allowMultiple: record.allowMultiple } : {}),
    ...(typeof record.allowFreeform === "boolean" ? { allowFreeform: record.allowFreeform } : {}),
    ...(normalizedOptions ? { options: normalizedOptions } : {}),
  };
}

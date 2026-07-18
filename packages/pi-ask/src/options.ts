import type { AskOption, AskOptionInput } from "./types";

interface AskToolParamsLike {
  question: string;
  context?: string;
  options?: Array<string | Record<string, string | undefined>>;
  allowMultiple?: boolean;
  allowFreeform?: boolean;
}

const OPTION_TITLE_KEYS = ["title", "label", "text", "value", "name", "option"] as const;

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
export function normalizeAskOption(option: AskOptionInput): AskOption | null {
  if (typeof option === "string") {
    const title = normalizeOptionalString(option);
    return title ? { title } : null;
  }

  for (const key of OPTION_TITLE_KEYS) {
    const title = normalizeOptionalString(option[key]);
    if (!title) {
      continue;
    }

    const description = normalizeOptionalString(option.description);
    return description ? { title, description } : { title };
  }

  return null;
}

/**
 * Normalizes an array of ask_user options, filtering out invalid entries.
 */
export function normalizeAskOptions(options: AskOptionInput[] | undefined): AskOption[] {
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
          (option): option is AskOptionInput =>
            typeof option === "string" || (option !== null && typeof option === "object"),
        )
        .map((option) => {
          if (typeof option === "string") {
            return option;
          }

          const normalizedObject: Record<string, string | undefined> = {};
          for (const key of OPTION_TITLE_KEYS) {
            const value = normalizeOptionalString(option[key]);
            if (value) {
              normalizedObject[key] = value;
            }
          }

          const description = normalizeOptionalString(option.description);
          if (description) {
            normalizedObject.description = description;
          }

          return normalizedObject;
        })
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

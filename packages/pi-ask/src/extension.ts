import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { normalizeAskOptions, normalizeAskToolParams } from "./options";
import { renderAskUserResult } from "./rendering";
import type { AskModeUnavailableReason, AskOption, AskResponse, AskResultDetails, AskToolParams } from "./types";
import { AskPrompt } from "./ui/AskPrompt";

const askOptionObjectSchema = Type.Object({
  title: Type.Optional(Type.String()),
  description: Type.Optional(Type.String()),
  label: Type.Optional(Type.String()),
  text: Type.Optional(Type.String()),
  value: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  option: Type.Optional(Type.String()),
});

const askUserSchema = Type.Object({
  question: Type.String({ description: "The question to ask the user" }),
  context: Type.Optional(Type.String({ description: "Relevant context shown before the question" })),
  options: Type.Optional(
    Type.Array(Type.Union([Type.String(), askOptionObjectSchema]), {
      description: "List of selectable options",
    }),
  ),
  allowMultiple: Type.Optional(Type.Boolean({ description: "Allow choosing multiple options" })),
  allowFreeform: Type.Optional(Type.Boolean({ description: "Allow a custom typed answer" })),
});

function createUnavailableResult(
  params: AskToolParams,
  options: AskOption[],
  unavailableReason: AskModeUnavailableReason,
): { content: Array<{ type: "text"; text: string }>; details: AskResultDetails } {
  return {
    content: [{ type: "text", text: `ask_user unavailable: ${unavailableReason}` }],
    details: {
      question: params.question,
      context: params.context,
      options,
      response: null,
      cancelled: true,
      unavailableReason,
    },
  };
}

function createResultContent(details: AskResultDetails): Array<{ type: "text"; text: string }> {
  if (details.unavailableReason) {
    return [{ type: "text", text: `ask_user unavailable: ${details.unavailableReason}` }];
  }

  if (details.cancelled || !details.response) {
    return [{ type: "text", text: "ask_user cancelled" }];
  }

  if (details.response.kind === "freeform") {
    return [{ type: "text", text: `User answered: ${details.response.text}` }];
  }

  return [{ type: "text", text: `User answered: ${details.response.selections.join(", ")}` }];
}

function buildRpcPromptMessage(question: string, context: string | undefined, options: AskOption[]): string {
  const lines = [question];
  if (context) {
    lines.push("", context);
  }
  if (options.length > 0) {
    lines.push("", ...options.map((option, index) => `${index + 1}. ${option.title}`));
  }
  return lines.join("\n");
}

function parseRpcSelectionToken(token: string, options: AskOption[]): string | null {
  const trimmedToken = token.trim();
  if (trimmedToken.length === 0) {
    return null;
  }

  const numericIndex = Number.parseInt(trimmedToken, 10);
  if (Number.isInteger(numericIndex) && String(numericIndex) === trimmedToken) {
    return options[numericIndex - 1]?.title ?? null;
  }

  const matchedOption = options.find((option) => option.title === trimmedToken);
  return matchedOption?.title ?? null;
}

async function runRpcPrompt(
  ctx: ExtensionContext,
  params: AskToolParams,
  options: AskOption[],
): Promise<AskResponse | null> {
  if (params.allowMultiple) {
    const selected = await ctx.ui.input(
      `${buildRpcPromptMessage(params.question, params.context, options)}\n\nComma-separated selections by number or exact title`,
    );
    if (!selected) {
      return null;
    }

    const selections = selected
      .split(",")
      .map((token) => parseRpcSelectionToken(token, options))
      .filter((selection): selection is string => selection !== null);
    return selections.length > 0 ? { kind: "selection", selections } : null;
  }

  const freeformSentinel = "__ask_user_freeform__";
  const selectOptions = [...options.map((option) => option.title), ...(params.allowFreeform ? [freeformSentinel] : [])];
  const selected = await ctx.ui.select(buildRpcPromptMessage(params.question, params.context, options), selectOptions);
  if (!selected) {
    return null;
  }

  if (selected === freeformSentinel) {
    const freeform = await ctx.ui.input("Type your answer");
    const trimmed = freeform?.trim();
    return trimmed ? { kind: "freeform", text: trimmed } : null;
  }

  const parsedSelection = parseRpcSelectionToken(selected, options);
  return parsedSelection ? { kind: "selection", selections: [parsedSelection] } : null;
}

/**
 * Registers the Pi ask_user extension.
 */
export function createPiAskExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "ask_user",
    label: "Ask User",
    description: "Ask the user to choose one or more options or provide a custom typed answer.",
    promptSnippet: "Use ask_user when the agent needs an explicit user decision before proceeding.",
    promptGuidelines: [
      "Use ask_user when the next step depends on a user decision and available context is sufficient to present a focused question.",
      "When using ask_user, include concise context and a small set of concrete options whenever possible.",
      "Do not use ask_user when the user has already given a clear decision or preference.",
    ],
    parameters: askUserSchema,
    executionMode: "sequential",
    prepareArguments(args) {
      return normalizeAskToolParams(args);
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const normalizedOptions = normalizeAskOptions(params.options);

      if (ctx.mode === "tui") {
        const response = (await ctx.ui.custom(
          (tui, theme, keybindings, onDone) =>
            new AskPrompt({
              question: params.question,
              context: params.context,
              options: normalizedOptions,
              allowMultiple: params.allowMultiple ?? false,
              allowFreeform: params.allowFreeform ?? true,
              tui,
              theme,
              keybindings,
              onDone,
            }),
        )) as AskResponse | null | undefined;
        const details: AskResultDetails = {
          question: params.question,
          context: params.context,
          options: normalizedOptions,
          response: response ?? null,
          cancelled: response === null,
        };
        return {
          content: createResultContent(details),
          details,
        };
      }

      if (ctx.mode === "rpc") {
        const response = await runRpcPrompt(ctx, params, normalizedOptions);
        const details: AskResultDetails = {
          question: params.question,
          context: params.context,
          options: normalizedOptions,
          response,
          cancelled: response === null,
        };
        return {
          content: createResultContent(details),
          details,
        };
      }

      return createUnavailableResult(
        params,
        normalizedOptions,
        ctx.hasUI ? "unsupported_ui_mode" : "non_interactive_mode",
      );
    },
    renderResult(result, _options, theme) {
      return renderAskUserResult(result.details as AskResultDetails, theme);
    },
  });
}

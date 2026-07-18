/**
 * Canonical normalized option shape for ask_user.
 */
export interface AskOption {
  title: string;
  description?: string;
}

export type AskOptionInput =
  | string
  | {
      title?: unknown;
      description?: unknown;
      label?: unknown;
      text?: unknown;
      value?: unknown;
      name?: unknown;
      option?: unknown;
    };

/**
 * Tool parameters accepted by ask_user after normalization.
 */
export interface AskToolParams {
  question: string;
  context?: string;
  options?: AskOptionInput[];
  allowMultiple?: boolean;
  allowFreeform?: boolean;
}

/**
 * Result payload when the user selects one or more provided options.
 */
export interface AskSelectionResponse {
  kind: "selection";
  selections: string[];
}

/**
 * Result payload when the user provides a custom typed answer.
 */
export interface AskFreeformResponse {
  kind: "freeform";
  text: string;
}

export type AskResponse = AskSelectionResponse | AskFreeformResponse;

export type AskModeUnavailableReason = "no_ui" | "non_interactive_mode" | "unsupported_ui_mode";

export const ASK_USER_STARTED_EVENT = "yishan:ask_user_started";
export const ASK_USER_ANSWERED_EVENT = "yishan:ask_user_answered";
export const ASK_USER_CANCELLED_EVENT = "yishan:ask_user_cancelled";

/**
 * Semantic ask_user lifecycle event payload emitted on Pi's inter-extension event bus.
 */
export interface AskUserLifecycleEventPayload {
  question: string;
  context?: string;
  optionCount: number;
  allowMultiple: boolean;
  allowFreeform: boolean;
}

/**
 * Structured result details persisted with ask_user tool results.
 */
export interface AskResultDetails {
  question: string;
  context?: string;
  options: AskOption[];
  response: AskResponse | null;
  cancelled: boolean;
  unavailableReason?: AskModeUnavailableReason;
}

import { COMPOSER_LINE_HEIGHT, COMPOSER_MAX_HEIGHT, COMPOSER_MAX_LINES } from "@/features/shell/state/shell.constants";

type SessionComposerLayout = {
  composerLineCount: number;
  composerTextHeight: number;
  hasDraft: boolean;
  isSingleLineComposer: boolean;
};

/**
 * Derives the SessionComposer layout state from the current draft text.
 */
export function getSessionComposerLayout(draft: string): SessionComposerLayout {
  const hasDraft = draft.trim().length > 0;
  const composerLineCount = Math.max(1, Math.min(COMPOSER_MAX_LINES, draft.split("\n").length));
  const composerTextHeight = Math.min(
    COMPOSER_MAX_HEIGHT - 16,
    Math.max(COMPOSER_LINE_HEIGHT, composerLineCount * COMPOSER_LINE_HEIGHT),
  );

  return {
    composerLineCount,
    composerTextHeight,
    hasDraft,
    isSingleLineComposer: composerLineCount === 1,
  };
}

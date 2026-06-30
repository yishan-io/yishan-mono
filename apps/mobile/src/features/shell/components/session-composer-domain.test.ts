import { describe, expect, it } from "vitest";

import { COMPOSER_LINE_HEIGHT, COMPOSER_MAX_HEIGHT, COMPOSER_MAX_LINES } from "@/features/shell/state/shell.constants";

import { getSessionComposerLayout } from "./session-composer-domain";

describe("session-composer-domain", () => {
  it("treats blank drafts as empty", () => {
    expect(getSessionComposerLayout("   ")).toMatchObject({
      composerLineCount: 1,
      composerTextHeight: COMPOSER_LINE_HEIGHT,
      hasDraft: false,
      isSingleLineComposer: true,
    });
  });

  it("marks non-empty drafts as sendable", () => {
    expect(getSessionComposerLayout("hello")).toMatchObject({
      hasDraft: true,
      isSingleLineComposer: true,
    });
  });

  it("grows with line breaks up to the configured max lines", () => {
    const draft = Array.from({ length: COMPOSER_MAX_LINES + 3 }, (_, index) => `line ${index + 1}`).join("\n");
    const layout = getSessionComposerLayout(draft);

    expect(layout.composerLineCount).toBe(COMPOSER_MAX_LINES);
    expect(layout.isSingleLineComposer).toBe(false);
    expect(layout.composerTextHeight).toBe(
      Math.min(COMPOSER_MAX_HEIGHT - 16, COMPOSER_MAX_LINES * COMPOSER_LINE_HEIGHT),
    );
  });
});

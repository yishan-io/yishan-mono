// @vitest-environment jsdom

import { createAppTheme } from "@renderer/theme";
import { MONO_FONT_FAMILY, resolveCodeTheme } from "@renderer/ui/codeThemes";
import { renderHook } from "@testing-library/react";
import { SEMANTIC_COLOR_TOKENS } from "@yishan-io/design-tokens";
import { describe, expect, it } from "vitest";
import { getCodeHighlightStyles, useMarkdownStyles } from "./markdownStyles";

const yishanDark = resolveCodeTheme("yishan", "dark");
const yishanLight = resolveCodeTheme("yishan", "light");
const draculaDark = resolveCodeTheme("dracula", "dark");

describe("useMarkdownStyles", () => {
  it("retains nested task-list indentation", () => {
    const theme = createAppTheme("dark");
    const { result } = renderHook(() => useMarkdownStyles(theme, 15, yishanDark, 13, "dark"));
    const nestedTaskSelector =
      "& li > ul > li:has(> input[type='checkbox']), & li > ol > li:has(> input[type='checkbox'])";

    expect(result.current.container[nestedTaskSelector]).toEqual({ ml: 0 });
  });

  it("uses codePalette.background and codeFontSize for pre blocks", () => {
    const theme = createAppTheme("dark");
    const { result } = renderHook(() => useMarkdownStyles(theme, 15, draculaDark, 16, "dark"));

    expect(result.current.container["& pre"].fontFamily).toBe(MONO_FONT_FAMILY);
    expect(result.current.container["& pre"].fontSize).toBe(16);
    expect(result.current.container["& pre"].bgcolor).toBe(draculaDark.background);
    expect(result.current.container["& pre"].border).toBe(`1px solid ${draculaDark.lineHighlight}`);
  });

  it("prose container font size follows baseFontSize, not codeFontSize", () => {
    const theme = createAppTheme("dark");
    const { result } = renderHook(() => useMarkdownStyles(theme, 18, yishanDark, 13, "dark"));

    expect(result.current.container.fontSize).toBe(18);
    // The pre font size should still be codeFontSize
    expect(result.current.container["& pre"].fontSize).toBe(13);
  });

  it("uses codeMode for gitDiff token selection regardless of the MUI theme palette mode", () => {
    // Simulate the MarkdownPreviewThemeProvider scenario:
    // MUI theme is "light" (override) but code palette + mode come from the app which is "dark".
    const theme = createAppTheme("light");
    const { result } = renderHook(() => useMarkdownStyles(theme, 15, yishanDark, 13, "dark"));

    const darkGitDiff = SEMANTIC_COLOR_TOKENS.dark.gitDiff;
    expect(result.current.container["& pre"]["& .hljs-deletion"]).toEqual({
      color: darkGitDiff.deleted,
      bgcolor: darkGitDiff.inline.deleted.background,
    });
    expect(result.current.container["& pre"]["& .hljs-addition"]).toEqual({
      color: darkGitDiff.added,
      bgcolor: darkGitDiff.inline.added.background,
    });
  });
});

describe("getCodeHighlightStyles", () => {
  it("maps hljs classes to yishan dark palette colors", () => {
    const styles = getCodeHighlightStyles(yishanDark, "dark");

    expect(styles["& .hljs-keyword, & .hljs-selector-tag, & .hljs-literal, & .hljs-section, & .hljs-link"]).toEqual({
      color: yishanDark.keyword,
    });
    expect(styles["& .hljs-string, & .hljs-attr"]).toEqual({ color: yishanDark.string });
    expect(styles["& .hljs-title, & .hljs-name, & .hljs-type"]).toEqual({ color: yishanDark.type });
    expect(styles["& .hljs-number, & .hljs-symbol, & .hljs-bullet"]).toEqual({ color: yishanDark.number });
    expect(styles["& .hljs-comment, & .hljs-quote, & .hljs-meta"]).toEqual({ color: yishanDark.comment });
    expect(styles["& .hljs-built_in, & .hljs-variable, & .hljs-template-variable"]).toEqual({
      color: yishanDark.variable,
    });
    expect(styles["& .hljs-params"]).toEqual({ color: yishanDark.variable });
    expect(styles["& .hljs-regexp"]).toEqual({ color: yishanDark.string });
    expect(styles["& .hljs-subst"]).toEqual({ color: yishanDark.foreground });
  });

  it("maps hljs classes to dracula dark palette colors", () => {
    const styles = getCodeHighlightStyles(draculaDark, "dark");

    expect(styles["& .hljs-keyword, & .hljs-selector-tag, & .hljs-literal, & .hljs-section, & .hljs-link"]).toEqual({
      color: draculaDark.keyword,
    });
    expect(styles["& .hljs-string, & .hljs-attr"]).toEqual({ color: draculaDark.string });
    expect(styles["& .hljs-title, & .hljs-name, & .hljs-type"]).toEqual({ color: draculaDark.type });
    expect(styles["& .hljs-number, & .hljs-symbol, & .hljs-bullet"]).toEqual({ color: draculaDark.number });
    expect(styles["& .hljs-comment, & .hljs-quote, & .hljs-meta"]).toEqual({ color: draculaDark.comment });
  });

  it("uses SEMANTIC_COLOR_TOKENS gitDiff for deletion/addition markers", () => {
    const darkStyles = getCodeHighlightStyles(yishanDark, "dark");
    const lightStyles = getCodeHighlightStyles(yishanLight, "light");

    const darkGitDiff = SEMANTIC_COLOR_TOKENS.dark.gitDiff;
    expect(darkStyles["& .hljs-deletion"]).toEqual({
      color: darkGitDiff.deleted,
      bgcolor: darkGitDiff.inline.deleted.background,
    });
    expect(darkStyles["& .hljs-addition"]).toEqual({
      color: darkGitDiff.added,
      bgcolor: darkGitDiff.inline.added.background,
    });

    const lightGitDiff = SEMANTIC_COLOR_TOKENS.light.gitDiff;
    expect(lightStyles["& .hljs-deletion"]).toEqual({
      color: lightGitDiff.deleted,
      bgcolor: lightGitDiff.inline.deleted.background,
    });
    expect(lightStyles["& .hljs-addition"]).toEqual({
      color: lightGitDiff.added,
      bgcolor: lightGitDiff.inline.added.background,
    });
  });

  it("uses codeMode for gitDiff regardless of palette (mixed case: light palette + dark mode)", () => {
    // Dracula palette is only dark-mode; if codeMode were "light" we'd
    // still use SEMANTIC_COLOR_TOKENS.light.gitDiff colors.
    const styles = getCodeHighlightStyles(draculaDark, "light");

    const lightGitDiff = SEMANTIC_COLOR_TOKENS.light.gitDiff;
    expect(styles["& .hljs-deletion"]).toEqual({
      color: lightGitDiff.deleted,
      bgcolor: lightGitDiff.inline.deleted.background,
    });
    expect(styles["& .hljs-addition"]).toEqual({
      color: lightGitDiff.added,
      bgcolor: lightGitDiff.inline.added.background,
    });
  });
});

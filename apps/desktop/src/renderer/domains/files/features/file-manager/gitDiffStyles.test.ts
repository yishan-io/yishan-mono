import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const gutterStylesheet = readFileSync(
  new URL("../file-editor/git-gutter/gitGutterDecorations.css", import.meta.url),
  "utf8",
);
const inlineDiffStylesheet = readFileSync(new URL("./gitInlineDiff.css", import.meta.url), "utf8");
const stylesheets = [gutterStylesheet, inlineDiffStylesheet];

function expectSelectorToUse(stylesheet: string, selector: string, variables: string[]) {
  const selectorBlock = stylesheet.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, "m"));
  for (const variable of variables) {
    expect(selectorBlock?.[1]).toContain(variable);
  }
}

describe("git diff stylesheet colors", () => {
  it("maps every light and dark gutter declaration to shared variables", () => {
    expectSelectorToUse(gutterStylesheet, "\\.git-gutter-added", ["var(--yishan-color-git-diff-added)"]);
    expectSelectorToUse(gutterStylesheet, "\\.git-gutter-modified", ["var(--yishan-color-git-diff-modified)"]);
    expectSelectorToUse(gutterStylesheet, "\\.git-gutter-deleted", ["var(--yishan-color-git-diff-deleted)"]);
    expectSelectorToUse(gutterStylesheet, 'html\\[data-app-theme-mode="dark"\\] \\.git-gutter-added', [
      "var(--yishan-color-git-diff-added)",
    ]);
    expectSelectorToUse(gutterStylesheet, 'html\\[data-app-theme-mode="dark"\\] \\.git-gutter-modified', [
      "var(--yishan-color-git-diff-modified)",
    ]);
    expectSelectorToUse(gutterStylesheet, 'html\\[data-app-theme-mode="dark"\\] \\.git-gutter-deleted', [
      "var(--yishan-color-git-diff-deleted)",
    ]);
  });

  it("maps every light and dark inline status declaration to shared variables", () => {
    expectSelectorToUse(inlineDiffStylesheet, "\\.git-inline-diff-line-old", [
      "var(--yishan-color-git-inline-deleted-foreground)",
      "var(--yishan-color-git-inline-deleted-background)",
    ]);
    expectSelectorToUse(inlineDiffStylesheet, "\\.git-inline-diff-line-new", [
      "var(--yishan-color-git-inline-added-foreground)",
      "var(--yishan-color-git-inline-added-background)",
    ]);
    expectSelectorToUse(inlineDiffStylesheet, 'html\\[data-app-theme-mode="dark"\\] \\.git-inline-diff-line-old', [
      "var(--yishan-color-git-inline-deleted-foreground)",
      "var(--yishan-color-git-inline-deleted-background)",
    ]);
    expectSelectorToUse(inlineDiffStylesheet, 'html\\[data-app-theme-mode="dark"\\] \\.git-inline-diff-line-new', [
      "var(--yishan-color-git-inline-added-foreground)",
      "var(--yishan-color-git-inline-added-background)",
    ]);
  });

  it("contains none of the migrated raw git status colors", () => {
    for (const rawColor of [
      "#2ea043",
      "#1a7fd4",
      "#f85149",
      "#3fb950",
      "#58a6ff",
      "#82071e",
      "#ffebe9",
      "#116329",
      "#dafbe1",
      "#ffa198",
      "#7ee787",
      "rgba(248, 81, 73, 0.15)",
      "rgba(63, 185, 80, 0.15)",
    ]) {
      for (const stylesheet of stylesheets) {
        expect(stylesheet).not.toContain(rawColor);
      }
    }
  });
});

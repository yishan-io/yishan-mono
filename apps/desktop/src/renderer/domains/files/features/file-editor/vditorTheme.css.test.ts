/**
 * @vitest-environment node
 *
 * Guards the `.vditor-task` word-break override in vditorTheme.css.
 *
 * Vditor's own stylesheet (`vditor/dist/index.css`) sets
 * `word-break: break-all` on `.vditor-task`, which splits English words
 * mid-word in checkbox list items (visible in TODO-style markdown files).
 * This test pins the override so an upstream vditor upgrade or a refactor
 * cannot silently reintroduce the broken wrapping.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(fileURLToPath(new URL("./vditorTheme.css", import.meta.url)), "utf8");

function extractTaskRule(): string {
  const start = css.indexOf(".vditor-app-editor .vditor-task");
  expect(start).toBeGreaterThanOrEqual(0);
  expect(css.slice(start, start + 40)).toContain(".vditor-task");
  const blockStart = css.indexOf("{", start);
  const blockEnd = css.indexOf("}", blockStart);
  return css.slice(start, blockEnd + 1);
}

describe("vditorTheme.css task list wrapping", () => {
  it("overrides vditor's break-all so words stay intact in task list items", () => {
    expect(extractTaskRule()).toContain("word-break: break-word");
  });

  it("does not inherit vditor's mid-word break-all behavior", () => {
    expect(extractTaskRule()).not.toMatch(/word-break:\s*break-all/);
  });
});

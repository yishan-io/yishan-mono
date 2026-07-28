// @vitest-environment jsdom

import { createAppTheme } from "@renderer/theme";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMarkdownStyles } from "./markdownStyles";

describe("useMarkdownStyles", () => {
  it("retains nested task-list indentation", () => {
    const theme = createAppTheme("dark");
    const { result } = renderHook(() => useMarkdownStyles(theme));
    const nestedTaskSelector =
      "& li > ul > li:has(> input[type='checkbox']), & li > ol > li:has(> input[type='checkbox'])";

    expect(result.current.container[nestedTaskSelector]).toEqual({ ml: 0 });
  });
});

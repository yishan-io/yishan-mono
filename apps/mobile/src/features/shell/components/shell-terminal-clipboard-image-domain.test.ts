import { describe, expect, it } from "vitest";

import { extractClipboardImageBase64Data } from "./shell-terminal-clipboard-image-domain";

describe("extractClipboardImageBase64Data", () => {
  it("returns the payload after one data-url prefix", () => {
    expect(extractClipboardImageBase64Data("data:image/png;base64,YWJjMTIz")).toBe("YWJjMTIz");
  });

  it("falls back to the original value when no prefix exists", () => {
    expect(extractClipboardImageBase64Data("YWJjMTIz")).toBe("YWJjMTIz");
  });
});

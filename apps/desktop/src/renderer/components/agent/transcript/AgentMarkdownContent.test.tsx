// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentMarkdownContent } from "./AgentMarkdownContent";

const mocked = vi.hoisted(() => ({
  parse: vi.fn<(content: string) => Promise<string>>(),
}));

vi.mock("@renderer/components/markdown/markdownService", () => ({
  markdownService: {
    parse: mocked.parse,
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AgentMarkdownContent", () => {
  it("renders streaming text without invoking the markdown parser", async () => {
    render(<AgentMarkdownContent content="**streaming**" renderMode="streaming" />);

    expect(screen.getByText("**streaming**")).toBeTruthy();

    await waitFor(() => {
      expect(mocked.parse).not.toHaveBeenCalled();
    });
  });

  it("still parses finalized markdown content", async () => {
    mocked.parse.mockResolvedValueOnce("<p><strong>done</strong></p>");

    render(<AgentMarkdownContent content="**done**" renderMode="final" />);

    await waitFor(() => {
      expect(mocked.parse).toHaveBeenCalledWith("**done**");
    });
  });
});

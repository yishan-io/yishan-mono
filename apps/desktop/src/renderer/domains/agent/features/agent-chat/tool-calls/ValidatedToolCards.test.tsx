// @vitest-environment jsdom
import { renderWithAppTheme } from "@renderer/testUtils/renderWithAppTheme";
import { createAppTheme } from "@renderer/ui/theme";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { projectToolCard } from "../../../chat/transcript/presentation";
import type { ToolCallSource } from "../../../chat/transcript/toolCalls.types";
import { BashToolCard } from "./BashToolCard";
import { DiffToolCard } from "./DiffToolCard";
import { GrepToolCard } from "./GrepToolCard";
import { MemoryReadToolCard } from "./MemoryReadToolCard";
import { MemorySearchToolCard } from "./MemorySearchToolCard";
import { ReadToolCard } from "./ReadToolCard";
import { WebFetchToolCard } from "./WebFetchToolCard";
import type { AgentToolCallCardProps } from "./summary";

const source: ToolCallSource = { id: "fact", origin: "live", isFinal: true, priority: 1 };
const cards = [
  { Card: ReadToolCard, name: "read", args: { path: "src/read.ts" }, label: "src/read.ts" },
  { Card: BashToolCard, name: "bash", args: { command: "echo validated" }, label: "echo validated" },
  { Card: DiffToolCard, name: "edit", args: { path: "src/edit.ts" }, label: "src/edit.ts" },
  { Card: DiffToolCard, name: "write", args: { path: "src/write.ts" }, label: "src/write.ts" },
  { Card: GrepToolCard, name: "grep", args: { pattern: "validated-pattern" }, label: "validated-pattern" },
  { Card: MemoryReadToolCard, name: "memory_read", args: { path: "notes/validated.md" }, label: "notes/validated.md" },
  { Card: MemorySearchToolCard, name: "memory_search", args: { query: "validated-query" }, label: "validated-query" },
  {
    Card: WebFetchToolCard,
    name: "web_fetch",
    args: { url: "https://validated.example" },
    label: "https://validated.example",
  },
];
function model(name: string, args: Record<string, unknown>): AgentToolCallCardProps {
  return projectToolCard({
    sessionId: "session",
    callId: "call",
    executionState: "unknown",
    owner: { name, arguments: args, source },
  });
}
afterEach(cleanup);

describe("validated payload slice A", () => {
  it.each(cards)(
    "uses validated $name fields with missing and wrong descriptor arguments",
    ({ Card, name, args, label }) => {
      const projected = model(name, args);
      for (const argumentsOverride of [{}, { path: 42, command: false, pattern: [], query: null, url: 42 }]) {
        const input = { ...projected, toolCall: { ...projected.toolCall, arguments: argumentsOverride } };
        const before = structuredClone(input);
        const view = renderWithAppTheme(<Card {...input} />);
        expect(screen.getByText(label)).toBeTruthy();
        expect(input).toEqual(before);
        view.unmount();
      }
    },
  );

  it.each(cards)(
    "keeps wrong-kind $name arguments/output visible and supports kind changes",
    ({ Card, name, args, label }) => {
      const projected = model(name, args);
      const input: AgentToolCallCardProps = {
        ...projected,
        renderer: { kind: "generic" },
        result: { text: "fallback output", isError: false },
      };
      const view = renderWithAppTheme(<Card {...input} />);
      expect(screen.getByText("arguments")).toBeTruthy();
      expect(
        screen.getByText(
          (_, element) => element?.tagName === "PRE" && element.textContent === JSON.stringify(args, null, 2),
        ),
      ).toBeTruthy();
      fireEvent.click(screen.getByText(name));
      expect(screen.getByText("fallback output")).toBeTruthy();
      view.rerender(<Card {...projected} />);
      expect(screen.getByText(label)).toBeTruthy();
      view.rerender(<Card {...input} />);
      expect(screen.getByText("arguments")).toBeTruthy();
    },
  );

  it("counts validated batch URLs rather than unvalidated page entries", () => {
    const projected = model("web_fetch", { pages: [{ url: "https://one.example" }, { url: "https://two.example" }] });
    renderWithAppTheme(
      <WebFetchToolCard {...projected} toolCall={{ ...projected.toolCall, arguments: { pages: [{}] } }} />,
    );
    expect(screen.getByText("2 pages")).toBeTruthy();
  });
});

describe("runtime error slice B", () => {
  it.each(cards)("uses model error for $name even before result arrives", ({ Card, name, args }) => {
    const projected = model(name, args);
    const theme = createAppTheme("dark");
    const expectedStyle = document.createElement("div").style;
    expectedStyle.borderColor = theme.palette.error.main;
    const view = renderWithAppTheme(<Card {...projected} isError result={null} />, { theme });
    const shell = view.container.firstElementChild;
    expect(shell).not.toBeNull();
    expect(shell && getComputedStyle(shell).borderColor).toBe(expectedStyle.borderColor);
    view.rerender(<Card {...projected} isError result={{ text: "runtime failure", isError: false }} />);
    fireEvent.click(screen.getByTestId("tool-chevron-right"));
    expect(screen.getByText(/\(error\)/)).toBeTruthy();
    expect(screen.getByText("runtime failure")).toBeTruthy();
  });

  it("does not synthesize a successful write diff for a runtime failure with no result", () => {
    const projected = model("write", { path: "src/new.ts", content: "export const added = true;\n" });
    const view = renderWithAppTheme(<DiffToolCard {...projected} isError result={null} />);
    expect(view.container.querySelector("diffs-container")).toBeNull();
    view.rerender(<DiffToolCard {...projected} isError={false} />);
    expect(view.container.querySelector("diffs-container")).not.toBeNull();
  });

  it("retains read ranges and skill markers", () => {
    renderWithAppTheme(<ReadToolCard {...model("read", { path: "/skills/check/SKILL.md", offset: 2, limit: 3 })} />);
    expect(screen.getByText("check")).toBeTruthy();
    expect(screen.getByText("2-4")).toBeTruthy();
  });

  it("retains grep match links", () => {
    renderWithAppTheme(
      <GrepToolCard
        {...model("grep", { pattern: "needle", path: "src" })}
        workspacePath="/workspace"
        result={{ text: "src/main.ts:7: needle here", isError: false }}
      />,
    );
    fireEvent.click(screen.getByTestId("tool-chevron-right"));
    expect(screen.getByRole("button", { name: "main.ts:7: needle here" })).toBeTruthy();
  });

  it("retains fetched markdown and links", async () => {
    renderWithAppTheme(
      <WebFetchToolCard
        {...model("web_fetch", { url: "https://validated.example" })}
        result={{ text: "## Fetched heading\n\n[Source](https://source.example)", isError: false }}
      />,
    );
    fireEvent.click(screen.getByTestId("tool-chevron-right"));
    expect(await screen.findByRole("heading", { name: "Fetched heading" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Source" }).getAttribute("href")).toBe("https://source.example");
  });

  it("retains supplied patch rendering", () => {
    const patch = "--- a/src/edit.ts\n+++ b/src/edit.ts\n@@ -1 +1 @@\n-old\n+new\n";
    const view = renderWithAppTheme(
      <DiffToolCard
        {...model("edit", { path: "src/edit.ts" })}
        result={{ text: "edited", details: { patch }, isError: false }}
      />,
    );
    expect(view.container.querySelector("diffs-container")).not.toBeNull();
    fireEvent.click(screen.getByTestId("tool-chevron-right"));
    expect(screen.getByText("edited")).toBeTruthy();
  });
});

import type { AutocompleteItem, AutocompleteProvider } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";

import type { AgentDefinition } from "../agents/types";
import { createAgentAutocompleteProvider } from "./autocompleteProvider";

const testAgents: AgentDefinition[] = [
  {
    name: "Explore",
    description: "Search and understand the codebase",
    systemPrompt: "Explore prompt",
    source: "builtin",
  },
  {
    name: "Reviewer",
    description: "Review code for defects",
    systemPrompt: "Reviewer prompt",
    source: "builtin",
  },
];

function createBaseProvider(items: AutocompleteItem[] | null, prefix = "@"): AutocompleteProvider {
  return {
    async getSuggestions() {
      return items === null ? null : { items, prefix };
    },
    applyCompletion(lines, cursorLine, cursorCol, item, currentPrefix) {
      const nextLines = [...lines];
      const currentLine = nextLines[cursorLine] ?? "";
      const prefixStartIndex = Math.max(0, cursorCol - currentPrefix.length);
      nextLines[cursorLine] = `${currentLine.slice(0, prefixStartIndex)}${item.value}${currentLine.slice(cursorCol)}`;
      return {
        lines: nextLines,
        cursorLine,
        cursorCol: prefixStartIndex + item.value.length,
      };
    },
  };
}

describe("createAgentAutocompleteProvider", () => {
  it("returns agent-only suggestions for @agent: queries", async () => {
    const provider = createAgentAutocompleteProvider(createBaseProvider(null), testAgents);

    const suggestions = await provider.getSuggestions(["@agent:Rev"], 0, "@agent:Rev".length, {
      signal: new AbortController().signal,
    });

    expect(suggestions).toEqual({
      prefix: "@agent:Rev",
      items: [
        {
          value: "@agent:Reviewer ",
          label: "Reviewer",
          description: "Agent · Review code for defects",
        },
      ],
    });
  });

  it("merges agent suggestions ahead of files for bare @ queries", async () => {
    const provider = createAgentAutocompleteProvider(
      createBaseProvider([{ value: "@src/index.ts", label: "src/index.ts" }]),
      testAgents,
    );

    const suggestions = await provider.getSuggestions(["@"], 0, 1, {
      signal: new AbortController().signal,
    });

    expect(suggestions?.items.map((item) => item.label)).toEqual(["Explore", "Reviewer", "src/index.ts"]);
  });

  it("falls back to file suggestions when no agent suggestion matches", async () => {
    const provider = createAgentAutocompleteProvider(
      createBaseProvider([{ value: "@src/auth.ts", label: "src/auth.ts" }], "@src"),
      testAgents,
    );

    const suggestions = await provider.getSuggestions(["@src"], 0, 4, {
      signal: new AbortController().signal,
    });

    expect(suggestions?.items.map((item) => item.label)).toEqual(["src/auth.ts"]);
  });

  it("applies agent completion without delegating to the base provider", () => {
    const provider = createAgentAutocompleteProvider(createBaseProvider(null), testAgents);

    const completion = provider.applyCompletion(
      ["@agent:Exp"],
      0,
      "@agent:Exp".length,
      { value: "@agent:Explore ", label: "Explore", description: "Agent · Search and understand the codebase" },
      "@agent:Exp",
    );

    expect(completion).toEqual({
      lines: ["@agent:Explore "],
      cursorLine: 0,
      cursorCol: "@agent:Explore ".length,
    });
  });
});

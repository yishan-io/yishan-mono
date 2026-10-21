import { describe, expect, it } from "vitest";

import { formatResultCollectorOutput } from "./resultCollector";

describe("formatResultCollectorOutput", () => {
  it("escapes XML-sensitive content in agent names and payloads", () => {
    const output = formatResultCollectorOutput([
      {
        agentId: "agent-1",
        agentName: 'Explore & "Reviewer"',
        status: "completed",
        responseText: "Found <tag> & </subagent> content",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          cost: 0,
          contextTokens: 0,
          turns: 0,
        },
      },
    ]);

    expect(output).toBe(
      '<subagent name="Explore &amp; &quot;Reviewer&quot;">\nFound &lt;tag&gt; &amp; &lt;/subagent&gt; content\n</subagent>',
    );
  });
});

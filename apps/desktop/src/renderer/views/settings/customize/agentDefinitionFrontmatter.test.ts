import { describe, expect, it } from "vitest";
import { applyFrontmatterModelThinking } from "./agentDefinitionFrontmatter";

describe("applyFrontmatterModelThinking", () => {
  it("inserts model/thinking before the closing delimiter when absent", () => {
    const content = "---\nname: my-helper\ndescription: Helper\n---\n# body\n";
    expect(applyFrontmatterModelThinking(content, "anthropic/claude-opus-4-5", "high")).toBe(
      "---\nname: my-helper\ndescription: Helper\nmodel: anthropic/claude-opus-4-5\nthinking: high\n---\n# body\n",
    );
  });

  it("replaces existing frontmatter lines", () => {
    const content = "---\nname: my-helper\ndescription: Helper\nmodel: old/model\nthinking: low\n---\n# body\n";
    expect(applyFrontmatterModelThinking(content, "new/model", "xhigh")).toBe(
      "---\nname: my-helper\ndescription: Helper\nmodel: new/model\nthinking: xhigh\n---\n# body\n",
    );
  });

  it("drops the line for an empty value", () => {
    const content = "---\nname: my-helper\ndescription: Helper\nmodel: old/model\n---\n# body\n";
    expect(applyFrontmatterModelThinking(content, "", "medium")).toBe(
      "---\nname: my-helper\ndescription: Helper\nthinking: medium\n---\n# body\n",
    );
  });

  it("clears both keys when both values are empty", () => {
    const content = "---\nname: my-helper\ndescription: Helper\nmodel: old/model\nthinking: high\n---\n# body\n";
    expect(applyFrontmatterModelThinking(content, "", "")).toBe(
      "---\nname: my-helper\ndescription: Helper\n---\n# body\n",
    );
  });

  it("returns content unchanged when there is no frontmatter block", () => {
    const content = "no frontmatter here\n";
    expect(applyFrontmatterModelThinking(content, "new/model", "high")).toBe(content);
  });

  it("returns content unchanged when the frontmatter block is unterminated", () => {
    const content = "---\nname: my-helper\ndescription: Helper\n";
    expect(applyFrontmatterModelThinking(content, "new/model", "high")).toBe(content);
  });

  it("leaves other frontmatter keys and the body untouched", () => {
    const content = "---\nname: my-helper\ndescription: Helper\nread_only: false\n---\nmodel: body-not-frontmatter\n";
    expect(applyFrontmatterModelThinking(content, "new/model", "low")).toBe(
      "---\nname: my-helper\ndescription: Helper\nread_only: false\nmodel: new/model\nthinking: low\n---\nmodel: body-not-frontmatter\n",
    );
  });
});

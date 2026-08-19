import { describe, expect, it } from "vitest";
import {
  applyFrontmatterMetadata,
  applyFrontmatterModelThinking,
  replaceAgentBody,
  splitAgentBody,
} from "./agentDefinitionFrontmatter";

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

  it("drops duplicate key lines so a last-wins parser cannot read a stale value", () => {
    const content = "---\nname: my-helper\ndescription: Helper\nmodel: old/model\nmodel: newer/model\n---\n# body\n";
    expect(applyFrontmatterModelThinking(content, "final/model", "medium")).toBe(
      "---\nname: my-helper\ndescription: Helper\nmodel: final/model\nthinking: medium\n---\n# body\n",
    );
  });

  it("leaves other frontmatter keys and the body untouched", () => {
    const content = "---\nname: my-helper\ndescription: Helper\nread_only: false\n---\nmodel: body-not-frontmatter\n";
    expect(applyFrontmatterModelThinking(content, "new/model", "low")).toBe(
      "---\nname: my-helper\ndescription: Helper\nread_only: false\nmodel: new/model\nthinking: low\n---\nmodel: body-not-frontmatter\n",
    );
  });
});

describe("splitAgentBody", () => {
  it("returns the body without the frontmatter", () => {
    expect(splitAgentBody("---\nname: my-helper\ndescription: Helper\n---\n# body\n")).toBe("# body\n");
  });

  it("strips the standard blank-line separator", () => {
    expect(splitAgentBody("---\nname: my-helper\n---\n\n# body\n")).toBe("# body\n");
  });

  it("keeps internal blank lines", () => {
    expect(splitAgentBody("---\nname: my-helper\n---\n\n# a\n\n# b\n")).toBe("# a\n\n# b\n");
  });

  it("returns content unchanged when there is no frontmatter", () => {
    expect(splitAgentBody("# body only\n")).toBe("# body only\n");
  });
});

describe("replaceAgentBody", () => {
  it("swaps the body and keeps the frontmatter intact", () => {
    expect(replaceAgentBody("---\nname: my-helper\ndescription: Helper\n---\n# old\n", "# new\n")).toBe(
      "---\nname: my-helper\ndescription: Helper\n---\n\n# new\n",
    );
  });

  it("supports an empty body", () => {
    expect(replaceAgentBody("---\nname: my-helper\n---\n\n# old\n", "")).toBe("---\nname: my-helper\n---");
  });

  it("replaces the whole content when there is no frontmatter", () => {
    expect(replaceAgentBody("# old\n", "# new\n")).toBe("# new\n");
  });
});

describe("applyFrontmatterMetadata", () => {
  it("replaces the tools block with a new list", () => {
    const content =
      "---\nname: my-helper\ndescription: Helper\ntools:\n  - read\n  - grep\nread_only: true\n---\n# body\n";
    expect(applyFrontmatterMetadata(content, { tools: ["read", "bash", "lsp_diagnostics"] })).toBe(
      "---\nname: my-helper\ndescription: Helper\ntools:\n  - read\n  - bash\n  - lsp_diagnostics\nread_only: true\n---\n# body\n",
    );
  });

  it("inserts a tools block before the closing delimiter when absent", () => {
    const content = "---\nname: my-helper\ndescription: Helper\nread_only: true\n---\n# body\n";
    expect(applyFrontmatterMetadata(content, { tools: ["read", "glob"] })).toBe(
      "---\nname: my-helper\ndescription: Helper\nread_only: true\ntools:\n  - read\n  - glob\n---\n# body\n",
    );
  });

  it("removes the tools block when the list is empty", () => {
    const content = "---\nname: my-helper\ndescription: Helper\ntools:\n  - read\n  - grep\n---\n# body\n";
    expect(applyFrontmatterMetadata(content, { tools: [] })).toBe(
      "---\nname: my-helper\ndescription: Helper\n---\n# body\n",
    );
  });

  it("leaves the tools block untouched when tools is not provided", () => {
    const content = "---\nname: my-helper\ndescription: Helper\ntools:\n  - read\n  - grep\n---\n# body\n";
    expect(applyFrontmatterMetadata(content, { model: "new/model" })).toBe(
      "---\nname: my-helper\ndescription: Helper\ntools:\n  - read\n  - grep\nmodel: new/model\n---\n# body\n",
    );
  });

  it("drops duplicate tools blocks so a last-wins parser cannot read a stale list", () => {
    const content = "---\nname: my-helper\ntools:\n  - read\ntools:\n  - grep\n---\n# body\n";
    expect(applyFrontmatterMetadata(content, { tools: ["bash"] })).toBe(
      "---\nname: my-helper\ntools:\n  - bash\n---\n# body\n",
    );
  });

  it("replaces an unindented tools block (dash at column 0) without stranding stale items", () => {
    const content = "---\nname: my-helper\ntools:\n- read\n- grep\n---\n# body\n";
    expect(applyFrontmatterMetadata(content, { tools: ["bash"] })).toBe(
      "---\nname: my-helper\ntools:\n  - bash\n---\n# body\n",
    );
  });

  it("recognizes spaced-colon duplicate keys and drops the stale line", () => {
    const content = '---\nname: my-helper\ndescription: "new"\ndescription : stale\n---\n# body\n';
    expect(applyFrontmatterMetadata(content, { description: "changed" })).toBe(
      '---\nname: my-helper\ndescription: "changed"\n---\n# body\n',
    );
  });

  it("writes description as a double-quoted YAML scalar", () => {
    const content = "---\nname: my-helper\ndescription: Old desc\n---\n# body\n";
    expect(applyFrontmatterMetadata(content, { description: 'Needs \\ "quoting"' })).toBe(
      '---\nname: my-helper\ndescription: "Needs \\\\ \\"quoting\\""\n---\n# body\n',
    );
  });

  it("drops the description line when the value is empty", () => {
    const content = "---\nname: my-helper\ndescription: Old desc\n---\n# body\n";
    expect(applyFrontmatterMetadata(content, { description: "   " })).toBe("---\nname: my-helper\n---\n# body\n");
  });

  it("replaces a block-scalar description without stranding its continuation lines", () => {
    const content = "---\nname: my-helper\ndescription: |\n  first line\n  second line\n---\n# body\n";
    expect(applyFrontmatterMetadata(content, { description: "New desc" })).toBe(
      '---\nname: my-helper\ndescription: "New desc"\n---\n# body\n',
    );
  });
});

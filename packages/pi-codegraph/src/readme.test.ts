import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const README_PATH = new URL("../README.md", import.meta.url);
const TOOL_NAMES = [
  "codegraph_search",
  "codegraph_callers",
  "codegraph_callees",
  "codegraph_impact",
  "codegraph_explore",
  "codegraph_node",
  "codegraph_status",
  "codegraph_files",
];

describe("README", () => {
  it("documents installation, prerequisites, tools, and usage", async () => {
    const readme = await readFile(README_PATH, "utf8");

    expect(readme).toContain("npm install @yishan-io/pi-codegraph");
    expect(readme).toContain("codegraph");
    expect(readme).toContain(".codegraph");
    expect(readme).toContain("pi -e npm:@yishan-io/pi-codegraph");
    expect(readme).toContain('import { createPiCodeGraphExtension } from "@yishan-io/pi-codegraph"');
    expect(readme).toContain("createPiCodeGraphExtension(pi)");
    expect(readme).not.toContain("Tool execution remains unavailable");
    for (const toolName of TOOL_NAMES) expect(readme).toContain(toolName);
  });
});

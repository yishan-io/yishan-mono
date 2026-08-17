import { describe, expect, it } from "vitest";
import { buildSubagentSlashCommands } from "./agentChatSlashCommandCatalog";

describe("buildSubagentSlashCommands", () => {
  it("loads packaged pi subagents instead of desktop CLI agents", () => {
    const commands = buildSubagentSlashCommands();
    const commandTitles = commands.map((command) => command.title);

    expect(commandTitles).toContain("/builder");
    expect(commandTitles).toContain("/code-reviewer");
    expect(commandTitles).toContain("/plan-reviewer");
    expect(commandTitles).not.toContain("/claude");
    expect(commandTitles).not.toContain("/gemini");
  });
});

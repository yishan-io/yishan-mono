import { beforeEach, describe, expect, it, vi } from "vitest";

const listSkillsMock = vi.fn();

vi.mock("../../commands/skillCommands", () => ({
  listSkills: listSkillsMock,
}));

describe("loadAgentChatSlashCommands", () => {
  beforeEach(() => {
    vi.resetModules();
    listSkillsMock.mockReset();
    listSkillsMock.mockResolvedValue([
      {
        name: "brainstorm",
        description: "Explore ideas before implementation.",
      },
    ]);
  });

  it("caches slash commands across chat tabs", async () => {
    const { loadAgentChatSlashCommands } = await import("./agentChatSlashCommandCache");

    const firstCommands = await loadAgentChatSlashCommands();
    const secondCommands = await loadAgentChatSlashCommands();

    expect(listSkillsMock).toHaveBeenCalledTimes(1);
    expect(secondCommands).toBe(firstCommands);
    expect(firstCommands.map((command) => command.title)).toContain("/brainstorm");
    expect(firstCommands.map((command) => command.title)).toContain("/builder");
  });
});

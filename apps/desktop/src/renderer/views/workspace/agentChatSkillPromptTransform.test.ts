import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RichComposerSlashCommand } from "../../components/RichComposer";

const getSkillDetailMock = vi.fn();

vi.mock("../../commands/skillCommands", () => ({
  getSkillDetail: getSkillDetailMock,
}));

const SLASH_COMMANDS: RichComposerSlashCommand[] = [
  {
    id: "skill:brainstorm",
    category: "skill",
    title: "/brainstorm",
    description: "Explore ideas before implementation.",
  },
  {
    id: "agent:builder",
    category: "agent",
    title: "/builder",
    description: "Build code changes.",
  },
];

describe("transformAgentChatPromptForSkills", () => {
  beforeEach(() => {
    vi.resetModules();
    getSkillDetailMock.mockReset();
    getSkillDetailMock.mockResolvedValue({
      name: "brainstorm",
      description: "Explore ideas before implementation.",
      version: "workspace",
      source: "official",
      sourceKind: "official",
      installed: true,
      installedForAgents: [],
      official: true,
      canUpdate: true,
      hasUpdate: false,
      files: {
        "SKILL.md": "# Brainstorm\n\nUse this skill before implementation.",
      },
    });
  });

  it("converts a leading skill slash command into an injected skill prompt", async () => {
    const { transformAgentChatPromptForSkills } = await import("./agentChatSkillPromptTransform");

    const transformedPrompt = await transformAgentChatPromptForSkills("/brainstorm how it works", SLASH_COMMANDS);

    expect(transformedPrompt).toContain('<skill name="brainstorm">');
    expect(transformedPrompt).toContain("# Brainstorm");
    expect(transformedPrompt).toContain("how it works");
  });

  it("does not convert non-skill slash commands", async () => {
    const { transformAgentChatPromptForSkills } = await import("./agentChatSkillPromptTransform");

    const transformedPrompt = await transformAgentChatPromptForSkills("/builder fix this", SLASH_COMMANDS);

    expect(transformedPrompt).toBe("/builder fix this");
    expect(getSkillDetailMock).not.toHaveBeenCalled();
  });
});

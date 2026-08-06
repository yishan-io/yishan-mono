import { describe, expect, it } from "vitest";
import type { RichComposerSlashCommand } from "../../components/RichComposer";
import { transformAgentChatPromptForSkills } from "./agentChatSkillPromptTransform";

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
  it("rewrites a leading skill slash command to pi's /skill: expansion form", async () => {
    const transformedPrompt = await transformAgentChatPromptForSkills("/brainstorm how it works", SLASH_COMMANDS);

    expect(transformedPrompt).toBe("/skill:brainstorm how it works");
  });

  it("rewrites a bare skill slash command without trailing text", async () => {
    const transformedPrompt = await transformAgentChatPromptForSkills("/brainstorm", SLASH_COMMANDS);

    expect(transformedPrompt).toBe("/skill:brainstorm");
  });

  it("does not convert non-skill slash commands", async () => {
    const transformedPrompt = await transformAgentChatPromptForSkills("/builder fix this", SLASH_COMMANDS);

    expect(transformedPrompt).toBe("/builder fix this");
  });

  it("leaves already-prefixed skill commands untouched", async () => {
    const transformedPrompt = await transformAgentChatPromptForSkills(
      "/skill:brainstorm make it concrete",
      SLASH_COMMANDS,
    );

    expect(transformedPrompt).toBe("/skill:brainstorm make it concrete");
  });

  it("leaves plain prompts untouched", async () => {
    const transformedPrompt = await transformAgentChatPromptForSkills("brainstorm this idea", SLASH_COMMANDS);

    expect(transformedPrompt).toBe("brainstorm this idea");
  });
});

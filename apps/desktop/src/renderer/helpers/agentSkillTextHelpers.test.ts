import { describe, expect, it } from "vitest";
import { formatAgentSessionTitle, normalizeAgentSessionTitle, parseSkillMessage } from "./agentSkillTextHelpers";

describe("parseSkillMessage", () => {
  it("extracts the skill name and trailing content from injected skill XML", () => {
    expect(parseSkillMessage('<skill name="brainstorm">\nskill body\n</skill>\n\nhow it works')).toEqual({
      skillName: "brainstorm",
      trailingContent: "how it works",
    });
  });
});

describe("normalizeAgentSessionTitle", () => {
  it("drops injected skill XML and keeps trailing user text", () => {
    expect(normalizeAgentSessionTitle('<skill name="brainstorm">\nskill body\n</skill>\n\nhow it works')).toBe(
      "how it works",
    );
  });

  it("falls back to a compact skill marker when the skill message has no trailing text", () => {
    expect(normalizeAgentSessionTitle('<skill name="brainstorm">\nskill body\n</skill>')).toBe("use skill: brainstorm");
  });

  it("removes leading slash-command syntax from titles", () => {
    expect(normalizeAgentSessionTitle("/brainstorm how it works")).toBe("how it works");
  });

  it("collapses plain text titles into one line", () => {
    expect(normalizeAgentSessionTitle("  think\n\nabout   this  ")).toBe("think about this");
  });
});

describe("formatAgentSessionTitle", () => {
  it("normalizes and truncates long titles for tab labels", () => {
    expect(
      formatAgentSessionTitle("/brainstorm this is a very long title that should be truncated for the tab bar"),
    ).toBe("this is a very long title that should be…");
  });

  it("falls back to the default label when no readable title remains", () => {
    expect(formatAgentSessionTitle("   ")).toBe("Agent Chat");
  });
});

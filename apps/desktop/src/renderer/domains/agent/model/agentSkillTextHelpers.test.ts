import { describe, expect, it } from "vitest";
import { formatAgentSessionTitle, normalizeAgentSessionTitle, parseSkillMessage } from "./agentSkillTextHelpers";

describe("parseSkillMessage", () => {
  it("extracts the skill name and trailing content from injected skill XML", () => {
    expect(parseSkillMessage('<skill name="brainstorm">\nskill body\n</skill>\n\nhow it works')).toEqual({
      skillName: "brainstorm",
      trailingContent: "how it works",
    });
  });

  it("extracts the skill name and trailing content from a /skill: command", () => {
    expect(parseSkillMessage("/skill:brainstorm how it works")).toEqual({
      skillName: "brainstorm",
      trailingContent: "how it works",
    });
  });

  it("extracts a bare /skill: command without trailing content", () => {
    expect(parseSkillMessage("/skill:brainstorm")).toEqual({
      skillName: "brainstorm",
      trailingContent: "",
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

  it("titles a /skill: command by its trailing text", () => {
    expect(normalizeAgentSessionTitle("/skill:brainstorm how it works")).toBe("how it works");
  });

  it("titles a bare /skill: command with a skill marker", () => {
    expect(normalizeAgentSessionTitle("/skill:brainstorm")).toBe("use skill: brainstorm");
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

  it("prefers sessionName over previewText when set", () => {
    expect(formatAgentSessionTitle("preview text", "Fallback", "User Name")).toBe("User Name");
  });

  it("ignores UUID sessionName and falls back to previewText", () => {
    expect(formatAgentSessionTitle("preview text", "Fallback", "550e8400-e29b-41d4-a716-446655440000")).toBe(
      "preview text",
    );
  });

  it("ignores empty/whitespace sessionName and falls back to previewText", () => {
    expect(formatAgentSessionTitle("preview text", "Fallback", "  ")).toBe("preview text");
  });

  it("truncates long sessionName", () => {
    expect(
      formatAgentSessionTitle("preview", "Fallback", "A very long session name that exceeds forty characters"),
    ).toBe("A very long session name that exceeds fo…");
  });

  it("trims sessionName whitespace", () => {
    expect(formatAgentSessionTitle("preview", "Fallback", "  My Chat  ")).toBe("My Chat");
  });
});

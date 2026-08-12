import { describe, expect, it } from "vitest";
import { AGENT_CHAT_TIP_KEYS, AGENT_CHAT_TIP_PREFIX_KEY } from "./agentChatTipCatalog";

describe("agentChatTipCatalog", () => {
  it("provides a non-empty list of unique tip keys", () => {
    expect(AGENT_CHAT_TIP_KEYS.length).toBeGreaterThan(0);
    expect(new Set(AGENT_CHAT_TIP_KEYS).size).toBe(AGENT_CHAT_TIP_KEYS.length);
  });

  it("uses only agentChat.tips.* keys", () => {
    for (const key of AGENT_CHAT_TIP_KEYS) {
      expect(key.startsWith("agentChat.tips.")).toBe(true);
    }
  });

  it("exposes a prefix key outside the tip list", () => {
    expect(AGENT_CHAT_TIP_PREFIX_KEY).toBe("agentChat.tips.prefix");
    expect(AGENT_CHAT_TIP_KEYS).not.toContain(AGENT_CHAT_TIP_PREFIX_KEY);
  });
});

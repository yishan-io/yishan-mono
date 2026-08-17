import { describe, expect, it } from "vitest";
import enAgentChat from "../../../locales/en/agentChat.json";
import zhAgentChat from "../../../locales/zh/agentChat.json";
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

  it("has a matching non-empty entry in both locale files for every tip key", () => {
    const enTips = enAgentChat.agentChat.tips as Record<string, string>;
    const zhTips = zhAgentChat.agentChat.tips as Record<string, string>;
    for (const key of AGENT_CHAT_TIP_KEYS) {
      const tipKey = key.slice("agentChat.tips.".length);
      expect(enTips[tipKey]?.trim().length ?? 0).toBeGreaterThan(0);
      expect(zhTips[tipKey]?.trim().length ?? 0).toBeGreaterThan(0);
    }

    expect(enTips.prefix?.trim().length ?? 0).toBeGreaterThan(0);
    expect(zhTips.prefix?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it("keeps en and zh tip key sets in sync", () => {
    const enKeys = Object.keys(enAgentChat.agentChat.tips).sort();
    const zhKeys = Object.keys(zhAgentChat.agentChat.tips).sort();
    expect(zhKeys).toEqual(enKeys);
  });
});

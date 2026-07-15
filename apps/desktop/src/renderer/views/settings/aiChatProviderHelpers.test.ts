import { describe, expect, it } from "vitest";
import type { PiProviderModelRecord, PiProviderRecord } from "../../../shared/contracts/piProviderConfig";
import {
  buildAiChatProviderConfigEntries,
  buildAvailableAiChatModelOptionsForProvider,
  buildAvailableAiChatProviderOptions,
  getAiChatProviderConfigEntryAction,
  getAiChatProviderConfigEntryStatusKind,
  isAiChatProviderConfiguredButUnavailable,
} from "./aiChatProviderHelpers";

function createProvider(
  id: string,
  name: string,
  hasAuth: boolean,
  authSource: PiProviderRecord["authSource"],
  authMethods: PiProviderRecord["authMethods"] = [],
  available = hasAuth,
): PiProviderRecord {
  return { id, name, hasAuth, available, authSource, authMethods };
}

const MODELS: PiProviderModelRecord[] = [
  {
    providerId: "zeta",
    providerName: "Zeta",
    modelId: "disabled",
    label: "Disabled",
    available: false,
  },
  {
    providerId: "openai",
    providerName: "OpenAI",
    modelId: "gpt-5",
    label: "GPT-5",
    available: true,
  },
  {
    providerId: "anthropic",
    providerName: "Anthropic",
    modelId: "claude-4",
    label: "Claude 4",
    available: true,
  },
];

describe("aiChatProviderHelpers", () => {
  it("builds one flat provider list ordered by Pi-derived configuration type", () => {
    const anthropic = createProvider("anthropic", "Anthropic", true, "oauth", [
      { kind: "oauth", label: "Anthropic (Claude Pro/Max)" },
      { kind: "api_key", label: "Anthropic API key" },
    ]);
    const bedrock = createProvider("amazon-bedrock", "Amazon Bedrock", false, "none", [
      { kind: "external", label: "AWS credentials" },
    ]);

    const entries = buildAiChatProviderConfigEntries([bedrock, anthropic]);

    expect(entries.map((entry) => entry.method.label)).toEqual([
      "Anthropic (Claude Pro/Max)",
      "Anthropic API key",
      "AWS credentials",
    ]);
  });

  it("derives connected state and actions for each configuration method independently", () => {
    const provider = createProvider("anthropic", "Anthropic", true, "oauth", [
      { kind: "oauth", label: "Anthropic (Claude Pro/Max)" },
      { kind: "api_key", label: "Anthropic API key" },
    ]);
    const entries = buildAiChatProviderConfigEntries([provider]);
    const oauthEntry = entries[0];
    const apiKeyEntry = entries[1];
    if (!oauthEntry || !apiKeyEntry) {
      throw new Error("Expected OAuth and API-key configuration entries");
    }

    expect(getAiChatProviderConfigEntryStatusKind(oauthEntry)).toBe("connectedOauth");
    expect(getAiChatProviderConfigEntryAction(oauthEntry)).toEqual({ kind: "manageOauth" });
    expect(getAiChatProviderConfigEntryStatusKind(apiKeyEntry)).toBeUndefined();
    expect(getAiChatProviderConfigEntryAction(apiKeyEntry)).toEqual({
      kind: "authenticate",
      method: "api_key",
    });
  });

  it.each([
    ["oauth", "connectedOauth"],
    ["auth_file", "connectedStored"],
    ["env", "connectedEnv"],
    ["external", "connectedExternal"],
    ["none", undefined],
  ] as const)("maps %s auth to %s status", (authSource, expectedStatus) => {
    const provider = createProvider("provider", "Provider", true, authSource);
    const method = { kind: authSource === "oauth" ? ("oauth" as const) : ("api_key" as const), label: "Auth" };
    expect(getAiChatProviderConfigEntryStatusKind({ provider, method })).toBe(expectedStatus);
  });

  it("identifies unconfigured ambient providers without making them actionable", () => {
    const method = { kind: "external", label: "AWS credentials" } as const;
    const provider = createProvider("amazon-bedrock", "Amazon Bedrock", false, "none", [method]);

    expect(getAiChatProviderConfigEntryStatusKind({ provider, method })).toBe("externalSetupRequired");
    expect(getAiChatProviderConfigEntryAction({ provider, method })).toBeUndefined();
  });

  it("keeps the active ambient API key read-only while allowing a switch to OAuth", () => {
    const provider = createProvider("anthropic", "Anthropic", true, "env", [
      { kind: "oauth", label: "Anthropic subscription" },
      { kind: "api_key", label: "Anthropic API key" },
    ]);

    expect(
      getAiChatProviderConfigEntryAction({ provider, method: { kind: "api_key", label: "Anthropic API key" } }),
    ).toBeUndefined();
    expect(
      getAiChatProviderConfigEntryAction({ provider, method: { kind: "oauth", label: "Anthropic subscription" } }),
    ).toEqual({ kind: "authenticate", method: "oauth" });
  });

  it("keeps stored credential status separate from runtime availability", () => {
    const provider = createProvider("azure", "Azure", true, "auth_file", [], false);

    expect(
      getAiChatProviderConfigEntryStatusKind({ provider, method: { kind: "api_key", label: "Azure API key" } }),
    ).toBe("connectedStored");
    expect(isAiChatProviderConfiguredButUnavailable(provider)).toBe(true);
  });

  it("builds unique provider options from providers with available models", () => {
    expect(
      buildAvailableAiChatProviderOptions([
        ...MODELS,
        {
          providerId: "openai",
          providerName: "OpenAI",
          modelId: "gpt-4.1",
          label: "GPT-4.1",
          available: true,
        },
      ]),
    ).toEqual([
      { id: "anthropic", name: "Anthropic" },
      { id: "openai", name: "OpenAI" },
    ]);
  });

  it("builds model options only for the selected available provider", () => {
    expect(buildAvailableAiChatModelOptionsForProvider(MODELS, "openai")).toEqual([
      { id: "openai/gpt-5", name: "GPT-5" },
    ]);
    expect(buildAvailableAiChatModelOptionsForProvider(MODELS, undefined)).toEqual([]);
  });
});

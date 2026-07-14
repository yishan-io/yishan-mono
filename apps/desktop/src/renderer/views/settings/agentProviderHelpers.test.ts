import { describe, expect, it } from "vitest";
import type { PiRuntimeModelRecord, PiRuntimeProviderRecord } from "../../../main/piRuntime/piRuntimeTypes";
import {
  buildAgentProviderConfigEntries,
  buildAvailablePiModelOptionsForProvider,
  buildAvailablePiProviderOptions,
  getAgentProviderConfigEntryAction,
  getAgentProviderConfigEntryStatusKind,
  getAgentProviderStatusKind,
  isAgentProviderConfiguredButUnavailable,
} from "./agentProviderHelpers";

function createProvider(
  id: string,
  name: string,
  hasAuth: boolean,
  authSource: PiRuntimeProviderRecord["authSource"],
  authMethods: PiRuntimeProviderRecord["authMethods"] = [],
  available = hasAuth,
): PiRuntimeProviderRecord {
  return { id, name, hasAuth, available, authSource, authMethods };
}

const MODELS: PiRuntimeModelRecord[] = [
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

describe("agentProviderHelpers", () => {
  it("builds one flat provider list ordered by Pi-derived configuration type", () => {
    const anthropic = createProvider("anthropic", "Anthropic", true, "oauth", [
      { kind: "oauth", label: "Anthropic (Claude Pro/Max)" },
      { kind: "api_key", label: "Anthropic API key" },
    ]);
    const bedrock = createProvider("amazon-bedrock", "Amazon Bedrock", false, "none", [
      { kind: "external", label: "AWS credentials" },
    ]);

    const entries = buildAgentProviderConfigEntries([bedrock, anthropic]);

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
    const entries = buildAgentProviderConfigEntries([provider]);
    const oauthEntry = entries[0];
    const apiKeyEntry = entries[1];
    if (!oauthEntry || !apiKeyEntry) {
      throw new Error("Expected OAuth and API-key configuration entries");
    }

    expect(getAgentProviderConfigEntryStatusKind(oauthEntry)).toBe("connectedOauth");
    expect(getAgentProviderConfigEntryAction(oauthEntry)).toEqual({ kind: "manageOauth" });
    expect(getAgentProviderConfigEntryStatusKind(apiKeyEntry)).toBeUndefined();
    expect(getAgentProviderConfigEntryAction(apiKeyEntry)).toEqual({
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
    expect(getAgentProviderStatusKind(createProvider("provider", "Provider", true, authSource))).toBe(expectedStatus);
  });

  it("identifies unconfigured ambient providers without making them actionable", () => {
    const method = { kind: "external", label: "AWS credentials" } as const;
    const provider = createProvider("amazon-bedrock", "Amazon Bedrock", false, "none", [method]);

    expect(getAgentProviderStatusKind(provider)).toBe("externalSetupRequired");
    expect(getAgentProviderConfigEntryAction({ provider, method })).toBeUndefined();
  });

  it("keeps the active ambient API key read-only while allowing a switch to OAuth", () => {
    const provider = createProvider("anthropic", "Anthropic", true, "env", [
      { kind: "oauth", label: "Anthropic subscription" },
      { kind: "api_key", label: "Anthropic API key" },
    ]);

    expect(
      getAgentProviderConfigEntryAction({ provider, method: { kind: "api_key", label: "Anthropic API key" } }),
    ).toBeUndefined();
    expect(
      getAgentProviderConfigEntryAction({ provider, method: { kind: "oauth", label: "Anthropic subscription" } }),
    ).toEqual({ kind: "authenticate", method: "oauth" });
  });

  it("keeps stored credential status separate from runtime availability", () => {
    const provider = createProvider("azure", "Azure", true, "auth_file", [], false);

    expect(getAgentProviderStatusKind(provider)).toBe("connectedStored");
    expect(isAgentProviderConfiguredButUnavailable(provider)).toBe(true);
  });

  it("builds unique provider options from providers with available models", () => {
    expect(
      buildAvailablePiProviderOptions([
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
    expect(buildAvailablePiModelOptionsForProvider(MODELS, "openai")).toEqual([{ id: "openai/gpt-5", name: "GPT-5" }]);
    expect(buildAvailablePiModelOptionsForProvider(MODELS, undefined)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import type { PiRuntimeModelRecord, PiRuntimeProviderRecord } from "../../../main/piRuntime/piRuntimeTypes";
import {
  buildAgentProviderConfigGroups,
  buildAvailablePiModelOptions,
  buildAvailablePiModelOptionsForProvider,
  buildAvailablePiProviderOptions,
  getAgentProviderConfigEntryAction,
  getAgentProviderConfigEntryStatusKind,
  getAgentProviderStatusKind,
  isAgentProviderConfiguredButUnavailable,
  isPiModelPatternAvailable,
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
  it("groups each provider configuration method by its Pi-derived type", () => {
    const anthropic = createProvider("anthropic", "Anthropic", true, "oauth", [
      { kind: "oauth", label: "Anthropic (Claude Pro/Max)" },
      { kind: "api_key", label: "Anthropic API key" },
    ]);
    const bedrock = createProvider("amazon-bedrock", "Amazon Bedrock", false, "none", [
      { kind: "external", label: "AWS credentials" },
    ]);

    const groups = buildAgentProviderConfigGroups([bedrock, anthropic]);

    expect(groups.oauth.map((entry) => entry.method.label)).toEqual(["Anthropic (Claude Pro/Max)"]);
    expect(groups.api_key.map((entry) => entry.method.label)).toEqual(["Anthropic API key"]);
    expect(groups.external.map((entry) => entry.provider.id)).toEqual(["amazon-bedrock"]);
  });

  it("derives connected state and actions for each configuration method independently", () => {
    const provider = createProvider("anthropic", "Anthropic", true, "oauth", [
      { kind: "oauth", label: "Anthropic (Claude Pro/Max)" },
      { kind: "api_key", label: "Anthropic API key" },
    ]);
    const groups = buildAgentProviderConfigGroups([provider]);
    const oauthEntry = groups.oauth[0];
    const apiKeyEntry = groups.api_key[0];
    if (!oauthEntry || !apiKeyEntry) {
      throw new Error("Expected OAuth and API-key configuration entries");
    }

    expect(getAgentProviderConfigEntryStatusKind(oauthEntry)).toBe("connectedOauth");
    expect(getAgentProviderConfigEntryAction(oauthEntry)).toEqual({ kind: "manageOauth" });
    expect(getAgentProviderConfigEntryStatusKind(apiKeyEntry)).toBe("availableToSwitch");
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
    ["none", "notConfigured"],
  ] as const)("maps %s auth to %s status", (authSource, expectedStatus) => {
    expect(getAgentProviderStatusKind(createProvider("provider", "Provider", true, authSource))).toBe(expectedStatus);
  });

  it("identifies unconfigured ambient providers without making them actionable", () => {
    const method = { kind: "external", label: "AWS credentials" } as const;
    const provider = createProvider("amazon-bedrock", "Amazon Bedrock", false, "none", [method]);

    expect(getAgentProviderStatusKind(provider)).toBe("externalSetupRequired");
    expect(getAgentProviderConfigEntryAction({ provider, method })).toBeUndefined();
  });

  it("keeps stored credential status separate from runtime availability", () => {
    const provider = createProvider("azure", "Azure", true, "auth_file", [], false);

    expect(getAgentProviderStatusKind(provider)).toBe("connectedStored");
    expect(isAgentProviderConfiguredButUnavailable(provider)).toBe(true);
  });

  it("builds sorted model options from available models only", () => {
    expect(buildAvailablePiModelOptions(MODELS)).toEqual([
      { id: "anthropic/claude-4", name: "Anthropic · Claude 4" },
      { id: "openai/gpt-5", name: "OpenAI · GPT-5" },
    ]);
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

  it("accepts only saved patterns that still identify an available model", () => {
    expect(isPiModelPatternAvailable(MODELS, "openai/gpt-5")).toBe(true);
    expect(isPiModelPatternAvailable(MODELS, "zeta/disabled")).toBe(false);
    expect(isPiModelPatternAvailable(MODELS, undefined)).toBe(false);
  });
});

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiChatSettingsStore } from "../../store/settings/aiChatSettingsStore";
import { piProviderConfigStore } from "../../store/settings/piProviderConfigStore";
import { AiChatProviderSettingsSection } from "./AiChatProviderSettingsSection";

const mocked = {
  getPiProviderConfigSnapshot: vi.fn(),
  refreshPiProviderConfigSnapshot: vi.fn(),
  authenticatePiProvider: vi.fn(),
  cancelPiProviderAuthentication: vi.fn(),
  removePiProviderCredential: vi.fn(),
  setDefaultAiChatModel: vi.fn(),
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../hooks/useCommands", () => ({
  useCommands: () => mocked,
}));

vi.mock("../../components/ModelAutocomplete", () => ({
  ModelAutocomplete: ({
    options,
    value,
    onChange,
    disabled,
    placeholder,
  }: {
    options: Array<{ id: string; name: string }>;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    placeholder?: string;
  }) => (
    <select
      data-testid={placeholder?.includes("providerPlaceholder") ? "pi-provider-select" : "pi-model-select"}
      aria-label={placeholder ?? "pi-model-select"}
      disabled={disabled}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">empty</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  ),
}));

function renderSection(path = "/settings?tab=agents") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AiChatProviderSettingsSection />
    </MemoryRouter>,
  );
}

describe("AiChatProviderSettingsSection", () => {
  beforeEach(() => {
    mocked.getPiProviderConfigSnapshot.mockResolvedValue(null);
    mocked.refreshPiProviderConfigSnapshot.mockResolvedValue(null);
    mocked.authenticatePiProvider.mockResolvedValue(null);
    mocked.cancelPiProviderAuthentication.mockResolvedValue(true);
    mocked.removePiProviderCredential.mockResolvedValue(null);
    mocked.setDefaultAiChatModel.mockImplementation(() => undefined);
    aiChatSettingsStore.setState({ defaultModel: undefined });
    piProviderConfigStore.setState({
      snapshot: {
        providers: [
          {
            id: "openai",
            name: "OpenAI",
            available: true,
            authSource: "auth_file",
            authMethods: [{ kind: "api_key", label: "OpenAI API key" }],
          },
          {
            id: "openai-codex",
            name: "ChatGPT Plus/Pro (Codex Subscription)",
            available: false,
            authSource: "none",
            authMethods: [{ kind: "oauth", label: "ChatGPT Plus/Pro" }],
          },
          {
            id: "amazon-bedrock",
            name: "Amazon Bedrock",
            available: false,
            authSource: "none",
            authMethods: [{ kind: "external", label: "AWS credentials" }],
          },
          {
            id: "anthropic",
            name: "Anthropic",
            available: true,
            authSource: "oauth",
            authMethods: [
              { kind: "oauth", label: "Anthropic (Claude Pro/Max)" },
              { kind: "api_key", label: "Anthropic API key" },
            ],
          },
        ],
        models: [
          {
            providerId: "openai",
            providerName: "OpenAI",
            modelId: "gpt-5",
            label: "gpt-5",
          },
        ],
      },
      loadState: "idle",
      errorMessage: undefined,
      pendingCredentialAction: undefined,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("scrolls to the provider settings section when its anchor is targeted", () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    renderSection("/settings?tab=agents#ai-chat-provider-settings");

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it("reuses the cached snapshot on mount and renders provider status rows", () => {
    renderSection();

    expect(mocked.getPiProviderConfigSnapshot).not.toHaveBeenCalled();

    expect(screen.getByText("settings.aiChatProviders.title")).toBeTruthy();
    expect(screen.getByTestId("provider-config-card")).toBeTruthy();
    expect(screen.getByText("OpenAI API key")).toBeTruthy();
    expect(screen.getByText("Anthropic (Claude Pro/Max)")).toBeTruthy();
    expect(screen.getByText("Anthropic API key")).toBeTruthy();
    expect(screen.getByText("ChatGPT Plus/Pro")).toBeTruthy();
    expect(screen.getByText("settings.aiChatProviders.providers.status.externalSetupRequired")).toBeTruthy();
    expect(screen.getByRole("button", { name: "settings.aiChatProviders.providers.actions.login" })).toBeTruthy();
    expect(screen.getByText("settings.aiChatProviders.models.selectionTitle")).toBeTruthy();
    expect(screen.getByText("settings.aiChatProviders.models.selectionDescription")).toBeTruthy();
  });

  it("loads the snapshot on mount when no cached snapshot exists", async () => {
    piProviderConfigStore.setState({ snapshot: null });

    renderSection();

    await waitFor(() => {
      expect(mocked.getPiProviderConfigSnapshot).toHaveBeenCalledOnce();
    });
  });

  it("uses actions instead of repeated status text for unconfigured actionable methods", () => {
    renderSection();

    expect(screen.getByText("settings.aiChatProviders.providers.badges.connectedOauth")).toBeTruthy();
    expect(screen.getByText("settings.aiChatProviders.providers.status.externalSetupRequired")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "settings.aiChatProviders.providers.actions.setApiKey" }),
    ).not.toHaveLength(0);
  });

  it("keeps every provider configuration row in one flat card", () => {
    renderSection();

    expect(screen.getByTestId("provider-config-card")).toBeTruthy();
  });

  it("forwards provider login and refresh actions through commands", async () => {
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "settings.aiChatProviders.providers.actions.login" }));
    fireEvent.click(screen.getByRole("button", { name: "settings.aiChatProviders.actions.refresh" }));

    await waitFor(() => {
      expect(mocked.authenticatePiProvider).toHaveBeenCalledWith({ providerId: "openai-codex", method: "oauth" });
    });
    expect(mocked.refreshPiProviderConfigSnapshot).toHaveBeenCalledOnce();
  });

  it("disables every login action while any provider login is pending", () => {
    piProviderConfigStore.setState({
      pendingCredentialAction: { kind: "authenticate", providerId: "another-provider", method: "oauth" },
    });

    renderSection();

    expect(
      (
        screen.getByRole("button", {
          name: "settings.aiChatProviders.providers.actions.login",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("shows Cancel only on the exact pending provider method", () => {
    const snapshot = piProviderConfigStore.getState().snapshot;
    if (!snapshot) {
      throw new Error("Expected provider snapshot");
    }
    piProviderConfigStore.setState({
      snapshot: {
        ...snapshot,
        providers: snapshot.providers.map((provider) =>
          provider.id === "anthropic" ? { ...provider, available: false, authSource: "none" as const } : provider,
        ),
      },
      pendingCredentialAction: { kind: "authenticate", providerId: "anthropic", method: "oauth" },
    });

    renderSection();

    const cancelButton = screen.getByRole("button", {
      name: "settings.aiChatProviders.providers.actions.cancel",
    });
    expect(cancelButton).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "settings.aiChatProviders.providers.actions.setApiKey",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    fireEvent.click(cancelButton);
    expect(mocked.cancelPiProviderAuthentication).toHaveBeenCalledWith("anthropic");
  });

  it("shows configured credentials separately from unavailable runtime models", () => {
    const snapshot = piProviderConfigStore.getState().snapshot;
    if (!snapshot) {
      throw new Error("Expected provider snapshot");
    }
    piProviderConfigStore.setState({
      snapshot: {
        ...snapshot,
        providers: snapshot.providers.map((provider) =>
          provider.id === "openai" ? { ...provider, available: false } : provider,
        ),
      },
    });

    renderSection();

    expect(screen.getByText("settings.aiChatProviders.providers.badges.configuredUnavailable")).toBeTruthy();
  });

  it("keeps provider filtering local and persists only the selected AI Chat model", () => {
    renderSection();

    const providerSelect = screen.getByTestId("pi-provider-select") as HTMLSelectElement;
    const modelSelect = screen.getByTestId("pi-model-select") as HTMLSelectElement;
    expect(providerSelect.disabled).toBe(false);
    expect(modelSelect.disabled).toBe(true);

    fireEvent.change(providerSelect, { target: { value: "openai" } });

    expect((screen.getByTestId("pi-model-select") as HTMLSelectElement).disabled).toBe(false);
    expect(screen.getByRole("option", { name: "gpt-5" })).toBeTruthy();

    fireEvent.change(screen.getByTestId("pi-model-select"), {
      target: { value: "gpt-5" },
    });
    expect(mocked.setDefaultAiChatModel).toHaveBeenCalledWith({ providerId: "openai", modelId: "gpt-5" });
  });

  it("saves the selected default Pi model and warns when the saved model becomes unavailable", async () => {
    aiChatSettingsStore.setState({ defaultModel: { providerId: "openai", modelId: "missing-model" } });

    renderSection();

    expect(screen.getByText("settings.aiChatProviders.models.unavailableWarning")).toBeTruthy();

    fireEvent.change(screen.getByTestId("pi-model-select"), {
      target: { value: "gpt-5" },
    });

    expect(mocked.setDefaultAiChatModel).toHaveBeenCalledWith({ providerId: "openai", modelId: "gpt-5" });
  });
});

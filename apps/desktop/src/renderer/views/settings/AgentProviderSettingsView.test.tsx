// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { agentSettingsStore } from "../../store/settings/agentSettingsStore";
import { piRuntimeStore } from "../../store/settings/piRuntimeStore";
import { AgentProviderSettingsView } from "./AgentProviderSettingsView";

const mocked = {
  getPiRuntimeSnapshot: vi.fn(),
  authenticatePiProvider: vi.fn(),
  cancelPiProviderAuthentication: vi.fn(),
  removePiProviderCredential: vi.fn(),
  setDefaultPiModelPattern: vi.fn(),
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

describe("AgentProviderSettingsView", () => {
  beforeEach(() => {
    mocked.getPiRuntimeSnapshot.mockResolvedValue(null);
    mocked.authenticatePiProvider.mockResolvedValue(null);
    mocked.cancelPiProviderAuthentication.mockResolvedValue(true);
    mocked.removePiProviderCredential.mockResolvedValue(null);
    mocked.setDefaultPiModelPattern.mockImplementation(() => undefined);
    agentSettingsStore.setState({
      inUseByAgentKind: {
        opencode: true,
        codex: true,
        claude: true,
        gemini: true,
        pi: true,
        copilot: true,
        cursor: true,
      },
      defaultAgentKind: undefined,
      customCommandByAgentKind: {},
      defaultPiModelPattern: undefined,
    });
    piRuntimeStore.setState({
      snapshot: {
        providers: [
          {
            id: "openai",
            name: "OpenAI",
            hasAuth: true,
            available: true,
            authSource: "auth_file",
            authMethods: [{ kind: "api_key", label: "OpenAI API key" }],
          },
          {
            id: "openai-codex",
            name: "ChatGPT Plus/Pro (Codex Subscription)",
            hasAuth: false,
            available: false,
            authSource: "none",
            authMethods: [{ kind: "oauth", label: "ChatGPT Plus/Pro" }],
          },
          {
            id: "amazon-bedrock",
            name: "Amazon Bedrock",
            hasAuth: false,
            available: false,
            authSource: "none",
            authMethods: [{ kind: "external", label: "AWS credentials" }],
          },
          {
            id: "anthropic",
            name: "Anthropic",
            hasAuth: true,
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
            available: true,
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
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("scrolls to and temporarily highlights the provider settings section when focused", () => {
    vi.useFakeTimers();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;

    render(<AgentProviderSettingsView focusRequested />);

    const panel = screen.getByTestId("agent-provider-settings-panel");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
    expect(panel.getAttribute("data-focus-highlighted")).toBe("true");

    act(() => {
      vi.advanceTimersByTime(1800);
    });

    expect(panel.getAttribute("data-focus-highlighted")).toBe("false");
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  });

  it("loads snapshot on mount and renders provider status rows", async () => {
    render(<AgentProviderSettingsView />);

    await waitFor(() => {
      expect(mocked.getPiRuntimeSnapshot).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("settings.agentProviders.title")).toBeTruthy();
    expect(screen.getByTestId("provider-config-card")).toBeTruthy();
    expect(screen.queryByTestId("provider-config-section-oauth")).toBeNull();
    expect(screen.queryByTestId("provider-config-section-api_key")).toBeNull();
    expect(screen.queryByTestId("provider-config-section-external")).toBeNull();
    expect(screen.getByText("OpenAI API key")).toBeTruthy();
    expect(screen.getByText("Anthropic (Claude Pro/Max)")).toBeTruthy();
    expect(screen.getByText("Anthropic API key")).toBeTruthy();
    expect(screen.getByText("ChatGPT Plus/Pro")).toBeTruthy();
    expect(screen.getByText("settings.agentProviders.providers.status.externalSetupRequired")).toBeTruthy();
    expect(screen.getByRole("button", { name: "settings.agentProviders.providers.actions.login" })).toBeTruthy();
    expect(screen.getByText("settings.agentProviders.models.selectionTitle")).toBeTruthy();
    expect(screen.getByText("settings.agentProviders.models.selectionDescription")).toBeTruthy();
  });

  it("uses actions instead of repeated status text for unconfigured actionable methods", () => {
    render(<AgentProviderSettingsView />);

    expect(screen.getByText("settings.agentProviders.providers.badges.connectedOauth")).toBeTruthy();
    expect(screen.getByText("settings.agentProviders.providers.status.externalSetupRequired")).toBeTruthy();
    expect(
      screen.getAllByRole("button", { name: "settings.agentProviders.providers.actions.setApiKey" }),
    ).not.toHaveLength(0);
  });

  it("keeps every provider configuration row in one flat card", () => {
    render(<AgentProviderSettingsView />);

    expect(screen.getByTestId("provider-config-card")).toBeTruthy();
    expect(screen.queryByTestId("provider-config-section-oauth")).toBeNull();
    expect(screen.queryByTestId("provider-config-section-api_key")).toBeNull();
    expect(screen.queryByTestId("provider-config-section-external")).toBeNull();
  });

  it("forwards provider login and refresh actions through commands", async () => {
    render(<AgentProviderSettingsView />);

    fireEvent.click(screen.getByRole("button", { name: "settings.agentProviders.providers.actions.login" }));
    fireEvent.click(screen.getByRole("button", { name: "settings.agentProviders.actions.refresh" }));

    await waitFor(() => {
      expect(mocked.authenticatePiProvider).toHaveBeenCalledWith({ providerId: "openai-codex", method: "oauth" });
    });
    expect(mocked.getPiRuntimeSnapshot).toHaveBeenCalledWith("refreshing");
  });

  it("disables every login action while any provider login is pending", () => {
    piRuntimeStore.setState({
      pendingCredentialAction: { kind: "authenticate", providerId: "another-provider", method: "oauth" },
    });

    render(<AgentProviderSettingsView />);

    expect(
      (
        screen.getByRole("button", {
          name: "settings.agentProviders.providers.actions.login",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("shows Cancel only on the exact pending provider method", () => {
    const snapshot = piRuntimeStore.getState().snapshot;
    if (!snapshot) {
      throw new Error("Expected provider snapshot");
    }
    piRuntimeStore.setState({
      snapshot: {
        ...snapshot,
        providers: snapshot.providers.map((provider) =>
          provider.id === "anthropic"
            ? { ...provider, hasAuth: false, available: false, authSource: "none" as const }
            : provider,
        ),
      },
      pendingCredentialAction: { kind: "authenticate", providerId: "anthropic", method: "oauth" },
    });

    render(<AgentProviderSettingsView />);

    const cancelButton = screen.getByRole("button", {
      name: "settings.agentProviders.providers.actions.cancel",
    });
    expect(cancelButton).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "settings.agentProviders.providers.actions.setApiKey",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    fireEvent.click(cancelButton);
    expect(mocked.cancelPiProviderAuthentication).toHaveBeenCalledWith("anthropic");
  });

  it("shows configured credentials separately from unavailable runtime models", () => {
    const snapshot = piRuntimeStore.getState().snapshot;
    if (!snapshot) {
      throw new Error("Expected provider snapshot");
    }
    piRuntimeStore.setState({
      snapshot: {
        ...snapshot,
        providers: snapshot.providers.map((provider) =>
          provider.id === "openai" ? { ...provider, available: false } : provider,
        ),
      },
    });

    render(<AgentProviderSettingsView />);

    expect(screen.getByText("settings.agentProviders.providers.badges.configuredUnavailable")).toBeTruthy();
  });

  it("keeps provider filtering local and persists only the selected AI Chat model", () => {
    render(<AgentProviderSettingsView />);

    const providerSelect = screen.getByTestId("pi-provider-select") as HTMLSelectElement;
    const modelSelect = screen.getByTestId("pi-model-select") as HTMLSelectElement;
    expect(providerSelect.disabled).toBe(false);
    expect(modelSelect.disabled).toBe(true);

    fireEvent.change(providerSelect, { target: { value: "openai" } });

    expect((screen.getByTestId("pi-model-select") as HTMLSelectElement).disabled).toBe(false);
    expect(screen.getByRole("option", { name: "gpt-5" })).toBeTruthy();

    fireEvent.change(screen.getByTestId("pi-model-select"), {
      target: { value: "openai/gpt-5" },
    });
    expect(mocked.setDefaultPiModelPattern).toHaveBeenCalledWith("openai/gpt-5");
  });

  it("saves the selected default Pi model and warns when the saved model becomes unavailable", async () => {
    agentSettingsStore.setState({ defaultPiModelPattern: "openai/missing-model" });

    render(<AgentProviderSettingsView />);

    expect(screen.getByText("settings.agentProviders.models.unavailableWarning")).toBeTruthy();

    fireEvent.change(screen.getByTestId("pi-model-select"), {
      target: { value: "openai/gpt-5" },
    });

    expect(mocked.setDefaultPiModelPattern).toHaveBeenCalledWith("openai/gpt-5");
  });
});

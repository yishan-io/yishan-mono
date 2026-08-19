// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentProviderSettingsView } from "./AgentProviderSettingsView";

const mocked = {
  listPiProviders: vi.fn(),
  savePiProvider: vi.fn(),
  removePiProvider: vi.fn(),
  openPiProviderLogin: vi.fn(),
};

vi.mock("../../../../domains/agent/commands/piProviderCommands", () => ({
  NO_ACTIVE_WORKSPACE_LOGIN_ERROR: "no-active-workspace",
  get listPiProviders() {
    return mocked.listPiProviders;
  },
  get removePiProvider() {
    return mocked.removePiProvider;
  },
  get savePiProvider() {
    return mocked.savePiProvider;
  },
  get openPiProviderLogin() {
    return mocked.openPiProviderLogin;
  },
}));

vi.mock("react-i18next", () => ({
  initReactI18next: {
    type: "3rdParty",
    init: () => undefined,
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../../../../app/commands/useCommands", () => {
  const commandSurface = () => ({
    listPiProviders: mocked.listPiProviders,
    savePiProvider: mocked.savePiProvider,
    removePiProvider: mocked.removePiProvider,
    openPiProviderLogin: mocked.openPiProviderLogin,
  });
  return {
    useAppCommands: commandSurface,
    useWorkspaceCommands: commandSurface,
    useAgentCommands: commandSurface,
    useGitCommands: commandSurface,
    useFileCommands: commandSurface,
    useWorkbenchCommands: commandSurface,
    useTerminalCommands: commandSurface,
  };
});

const apiKeyProvider = { provider: "deepseek", type: "api_key" };
const oauthProvider = { provider: "openai-codex", type: "oauth" };
const ambientProvider = { provider: "amazon-bedrock", type: "ambient", source: "AWS_PROFILE: ai-bedrock" };

function mockListOnce(providers: Array<{ provider: string; type: string; envVars?: string[] }>) {
  mocked.listPiProviders.mockResolvedValueOnce(providers);
}

describe("AgentProviderSettingsView", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders registered providers with name and credential-type badge", async () => {
    mockListOnce([apiKeyProvider, oauthProvider]);

    render(<AgentProviderSettingsView />);

    expect(await screen.findByText("DeepSeek")).toBeTruthy();
    expect(screen.getByText("OpenAI Codex")).toBeTruthy();
    expect(screen.getByText("settings.providers.credentialType.apiKey")).toBeTruthy();
    expect(screen.getByText("settings.providers.credentialType.oauth")).toBeTruthy();
  });

  it("renders ambient providers with an Environment chip and a pin action", async () => {
    mockListOnce([ambientProvider]);

    render(<AgentProviderSettingsView />);

    expect(await screen.findByText("Amazon Bedrock")).toBeTruthy();
    expect(screen.getByText("settings.providers.credentialType.ambient")).toBeTruthy();
    expect(screen.queryByLabelText(/settings.providers.actions.edit/)).toBeNull();
    expect(screen.queryByLabelText(/settings.providers.actions.remove/)).toBeNull();

    // Ambient AWS profile rows offer one-click pinning with the profile prefilled.
    fireEvent.click(screen.getByLabelText("settings.providers.actions.pin Amazon Bedrock"));
    expect(await screen.findByText("settings.providers.dialog.addTitle")).toBeTruthy();
    const envInput = (await screen.findByRole("textbox")) as HTMLInputElement;
    expect(envInput.value).toBe("ai-bedrock");
  });

  it("shows edit button only for api_key entries", async () => {
    mockListOnce([apiKeyProvider, oauthProvider]);

    render(<AgentProviderSettingsView />);

    await screen.findByText("DeepSeek");
    const editButtons = screen.getAllByLabelText(/settings.providers.actions.edit/);
    expect(editButtons).toHaveLength(1);
    const [editButton] = editButtons;
    expect(editButton?.getAttribute("aria-label")).toContain("DeepSeek");
    expect(screen.queryByLabelText("settings.providers.actions.edit OpenAI Codex")).toBeNull();
  });

  it("renders empty state when no providers are registered", async () => {
    mockListOnce([]);

    render(<AgentProviderSettingsView />);

    expect(await screen.findByText("settings.providers.empty")).toBeTruthy();
  });

  it("shows load error when listing fails", async () => {
    mocked.listPiProviders.mockRejectedValueOnce(new Error("boom"));

    render(<AgentProviderSettingsView />);

    expect(await screen.findByText("settings.providers.loadError")).toBeTruthy();
  });

  it("adds a provider through the dialog and refreshes", async () => {
    mockListOnce([]);

    render(<AgentProviderSettingsView />);

    fireEvent.click(await screen.findByText("settings.providers.actions.add"));

    expect(await screen.findByText("settings.providers.dialog.addTitle")).toBeTruthy();

    fireEvent.mouseDown(screen.getByRole("combobox"));
    const option = await screen.findByRole("option", { name: "DeepSeek" });
    fireEvent.click(option);

    const keyInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(keyInput, {
      target: { value: "sk-test-secret" },
    });

    fireEvent.click(screen.getByText("settings.providers.actions.save"));

    await waitFor(() => {
      // PROBE
      expect(mocked.savePiProvider.mock.calls.length).toBeGreaterThan(0);
      expect(mocked.savePiProvider).toHaveBeenCalledWith("deepseek", "sk-test-secret", undefined);
    });
    expect(mocked.listPiProviders).toHaveBeenCalledTimes(2); // initial load + refresh after save
  });

  it("edits an existing provider by re-entering the key", async () => {
    mockListOnce([apiKeyProvider]);

    render(<AgentProviderSettingsView />);

    fireEvent.click(await screen.findByLabelText("settings.providers.actions.edit DeepSeek"));

    expect(await screen.findByText("settings.providers.dialog.editTitle")).toBeTruthy();
    // Provider select is read-only in edit mode.
    expect(screen.getByRole("combobox").getAttribute("aria-disabled")).toBe("true");

    const keyInput = document.querySelector('input[type="password"]') as HTMLInputElement;
    fireEvent.change(keyInput, {
      target: { value: "sk-new-key" },
    });
    fireEvent.click(screen.getByText("settings.providers.actions.save"));

    await waitFor(() => {
      expect(mocked.savePiProvider).toHaveBeenCalledWith("deepseek", "sk-new-key", undefined);
    });
  });

  it("warns that stored environment variables are removed on edit unless re-entered", async () => {
    mockListOnce([{ provider: "cloudflare-ai-gateway", type: "api_key", envVars: ["CLOUDFLARE_ACCOUNT_ID"] }]);

    render(<AgentProviderSettingsView />);

    fireEvent.click(await screen.findByLabelText("settings.providers.actions.edit Cloudflare AI Gateway"));
    expect(await screen.findByText("settings.providers.dialog.editTitle")).toBeTruthy();
    expect(screen.getByText(/settings.providers.dialog.envStoredWarning/)).toBeTruthy();
  });

  it("removes a provider after confirmation", async () => {
    mockListOnce([apiKeyProvider]);

    render(<AgentProviderSettingsView />);

    fireEvent.click(await screen.findByLabelText("settings.providers.actions.remove DeepSeek"));

    expect(await screen.findByText("settings.providers.removeDialog.title")).toBeTruthy();
    fireEvent.click(screen.getByText("settings.providers.removeDialog.confirm"));

    await waitFor(() => {
      expect(mocked.removePiProvider).toHaveBeenCalledWith("deepseek");
    });
    expect(mocked.listPiProviders).toHaveBeenCalledTimes(2); // initial load + refresh after remove
  });

  it("signs in with subscription for oauth-only providers without a key field", async () => {
    mocked.openPiProviderLogin.mockResolvedValueOnce(undefined);
    mockListOnce([]);

    render(<AgentProviderSettingsView />);

    fireEvent.click(await screen.findByText("settings.providers.actions.add"));
    await screen.findByText("settings.providers.dialog.addTitle");

    fireEvent.mouseDown(screen.getByRole("combobox"));
    const option = await screen.findByRole("option", { name: /OpenAI Codex/ });
    fireEvent.click(option);

    // Subscription-only: no API key field, only the sign-in action.
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.getByText("settings.providers.dialog.oauthOnlyHint")).toBeTruthy();

    fireEvent.click(screen.getByText("settings.providers.dialog.signInWithSubscription"));

    await waitFor(() => {
      expect(mocked.openPiProviderLogin).toHaveBeenCalledWith({
        providerId: "openai-codex",
        tabTitle: "settings.providers.dialog.loginTabTitle",
      });
    });
  });

  it("tags subscription-capable providers in the dropdown but not api-key-only or OAuth-gateway ones", async () => {
    mockListOnce([]);

    render(<AgentProviderSettingsView />);

    fireEvent.click(await screen.findByText("settings.providers.actions.add"));
    await screen.findByText("settings.providers.dialog.addTitle");

    fireEvent.mouseDown(screen.getByRole("combobox"));

    const anthropicOption = await screen.findByRole("option", { name: /Anthropic/ });
    expect(anthropicOption.textContent).toContain("settings.providers.dialog.subscriptionTag");

    const deepseekOption = await screen.findByRole("option", { name: "DeepSeek" });
    expect(deepseekOption.textContent).not.toContain("settings.providers.dialog.subscriptionTag");

    // OpenRouter has OAuth sign-in but is NOT a subscription — no tag.
    const openrouterOption = await screen.findByRole("option", { name: /OpenRouter/ });
    expect(openrouterOption.textContent).not.toContain("settings.providers.dialog.subscriptionTag");
  });

  it("labels the sign-in button by subscription vs account", async () => {
    mockListOnce([]);

    render(<AgentProviderSettingsView />);

    fireEvent.click(await screen.findByText("settings.providers.actions.add"));
    await screen.findByText("settings.providers.dialog.addTitle");

    fireEvent.mouseDown(screen.getByRole("combobox"));
    const anthropicOption = await screen.findByRole("option", { name: /Anthropic/ });
    fireEvent.click(anthropicOption);
    expect(screen.getByText("settings.providers.dialog.signInWithSubscription")).toBeTruthy();

    fireEvent.mouseDown(screen.getByRole("combobox"));
    const openrouterOption = await screen.findByRole("option", { name: /OpenRouter/ });
    fireEvent.click(openrouterOption);
    expect(screen.getByText("settings.providers.dialog.signInWithAccount")).toBeTruthy();
  });

  it("saves an environment-only credential for cloud providers", async () => {
    mockListOnce([]);

    render(<AgentProviderSettingsView />);

    fireEvent.click(await screen.findByText("settings.providers.actions.add"));
    await screen.findByText("settings.providers.dialog.addTitle");

    fireEvent.mouseDown(screen.getByRole("combobox"));
    const option = await screen.findByRole("option", { name: /Amazon Bedrock/ });
    fireEvent.click(option);

    // Env section with AWS_PROFILE appears; save works without any API key.
    const envInput = (await screen.findByRole("textbox")) as HTMLInputElement;
    fireEvent.change(envInput, { target: { value: "sandbox" } });
    fireEvent.click(screen.getByText("settings.providers.actions.save"));

    await waitFor(() => {
      expect(mocked.savePiProvider).toHaveBeenCalledWith("amazon-bedrock", "", { AWS_PROFILE: "sandbox" });
    });
  });

  it("shows the subscription sign-in action alongside the key field for both-mode providers", async () => {
    mockListOnce([]);

    render(<AgentProviderSettingsView />);

    fireEvent.click(await screen.findByText("settings.providers.actions.add"));
    await screen.findByText("settings.providers.dialog.addTitle");

    fireEvent.mouseDown(screen.getByRole("combobox"));
    const option = await screen.findByRole("option", { name: /Anthropic/ });
    fireEvent.click(option);

    expect(document.querySelector('input[type="password"]')).not.toBeNull();
    expect(screen.getByText("settings.providers.dialog.signInWithSubscription")).toBeTruthy();
    expect(screen.getByText("settings.providers.dialog.subscriptionHint")).toBeTruthy();
  });

  it("shows a localized error when no workspace is open for subscription sign-in", async () => {
    mocked.openPiProviderLogin.mockRejectedValueOnce(new Error("no-active-workspace"));
    mockListOnce([]);

    render(<AgentProviderSettingsView />);

    fireEvent.click(await screen.findByText("settings.providers.actions.add"));
    await screen.findByText("settings.providers.dialog.addTitle");

    fireEvent.mouseDown(screen.getByRole("combobox"));
    const option = await screen.findByRole("option", { name: /OpenAI Codex/ });
    fireEvent.click(option);
    fireEvent.click(screen.getByText("settings.providers.dialog.signInWithSubscription"));

    expect(await screen.findByText("settings.providers.errors.noWorkspace")).toBeTruthy();
  });

  it("never renders saved API keys in the list", async () => {
    mockListOnce([apiKeyProvider]);

    render(<AgentProviderSettingsView />);

    await screen.findByText("DeepSeek");
    expect(document.body.textContent).not.toContain("sk-");
  });
});

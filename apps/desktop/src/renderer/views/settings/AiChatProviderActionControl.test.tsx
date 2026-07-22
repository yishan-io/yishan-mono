// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PiProviderAuthMethod, PiProviderRecord } from "../../../shared/contracts/piProviderConfig";
import { AiChatProviderActionControl } from "./AiChatProviderActionControl";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function createProvider(overrides: Partial<PiProviderRecord>): PiProviderRecord {
  return {
    id: "provider",
    name: "Provider",
    available: false,
    authSource: "none",
    authMethods: [],
    ...overrides,
  };
}

function renderControl(provider: PiProviderRecord, method: PiProviderAuthMethod, disabled = false, pending = false) {
  const onAuthenticate = vi.fn();
  const onCancelAuthentication = vi.fn();
  const onRemoveCredential = vi.fn();
  render(
    <AiChatProviderActionControl
      provider={provider}
      method={method}
      disabled={disabled}
      pending={pending}
      onAuthenticate={onAuthenticate}
      onCancelAuthentication={onCancelAuthentication}
      onRemoveCredential={onRemoveCredential}
    />,
  );
  return { onAuthenticate, onCancelAuthentication, onRemoveCredential };
}

describe("AiChatProviderActionControl", () => {
  afterEach(cleanup);

  it("starts the only OAuth method directly", () => {
    const method = { kind: "oauth", label: "Subscription" } as const;
    const provider = createProvider({ authMethods: [method] });
    const { onAuthenticate } = renderControl(provider, method);

    fireEvent.click(screen.getByRole("button", { name: "settings.aiChatProviders.providers.actions.login" }));

    expect(onAuthenticate).toHaveBeenCalledWith({ providerId: "provider", method: "oauth" });
  });

  it("starts the only API-key method directly", () => {
    const method = { kind: "api_key", label: "Provider API key" } as const;
    const provider = createProvider({ authMethods: [method] });
    const { onAuthenticate } = renderControl(provider, method);

    fireEvent.click(screen.getByRole("button", { name: "settings.aiChatProviders.providers.actions.setApiKey" }));

    expect(onAuthenticate).toHaveBeenCalledWith({ providerId: "provider", method: "api_key" });
  });

  it("starts the selected method directly for dual-auth providers", () => {
    const provider = createProvider({
      authMethods: [
        { kind: "oauth", label: "Subscription" },
        { kind: "api_key", label: "Provider API key" },
      ],
    });
    const { onAuthenticate } = renderControl(provider, { kind: "api_key", label: "Provider API key" });

    fireEvent.click(screen.getByRole("button", { name: "settings.aiChatProviders.providers.actions.setApiKey" }));

    expect(onAuthenticate).toHaveBeenCalledWith({ providerId: "provider", method: "api_key" });
  });

  it("confirms before replacing another active authentication method", () => {
    const provider = createProvider({
      available: true,
      authSource: "oauth",
      authMethods: [
        { kind: "oauth", label: "Subscription" },
        { kind: "api_key", label: "Provider API key" },
      ],
    });
    const { onAuthenticate } = renderControl(provider, { kind: "api_key", label: "Provider API key" });

    fireEvent.click(screen.getByRole("button", { name: "settings.aiChatProviders.providers.actions.setApiKey" }));

    expect(onAuthenticate).not.toHaveBeenCalled();
    expect(screen.getByText("settings.aiChatProviders.providers.switchDialog.title")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "settings.aiChatProviders.providers.switchDialog.confirm" }));
    expect(onAuthenticate).toHaveBeenCalledWith({ providerId: "provider", method: "api_key" });
  });

  it("logs out an OAuth provider directly without opening a manage menu", () => {
    const method = { kind: "oauth", label: "Subscription" } as const;
    const provider = createProvider({
      available: true,
      authSource: "oauth",
      authMethods: [method],
    });
    const { onRemoveCredential } = renderControl(provider, method);

    expect(screen.queryByRole("button", { name: "settings.aiChatProviders.providers.actions.manage" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "settings.aiChatProviders.providers.actions.logout" }));

    expect(onRemoveCredential).toHaveBeenCalledWith("provider");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("manages stored API keys with replace and remove actions", () => {
    const provider = createProvider({ available: true, authSource: "auth_file" });
    const method = { kind: "api_key", label: "Provider API key" } as const;
    const { onAuthenticate, onRemoveCredential } = renderControl(provider, method);

    fireEvent.click(screen.getByRole("button", { name: "settings.aiChatProviders.providers.actions.manage" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "settings.aiChatProviders.providers.actions.replace" }));
    expect(onAuthenticate).toHaveBeenCalledWith({ providerId: "provider", method: "api_key" });

    fireEvent.click(screen.getByRole("button", { name: "settings.aiChatProviders.providers.actions.manage" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "settings.aiChatProviders.providers.actions.remove" }));
    expect(onRemoveCredential).toHaveBeenCalledWith("provider");
  });

  it("renders no action for externally managed providers", () => {
    renderControl(createProvider({ available: true, authSource: "env" }), {
      kind: "api_key",
      label: "Provider API key",
    });

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("confirms before replacing ambient API-key authentication with OAuth", () => {
    const provider = createProvider({
      available: true,
      authSource: "env",
      authMethods: [
        { kind: "oauth", label: "Subscription" },
        { kind: "api_key", label: "Provider API key" },
      ],
    });
    const { onAuthenticate } = renderControl(provider, { kind: "oauth", label: "Subscription" });

    fireEvent.click(screen.getByRole("button", { name: "settings.aiChatProviders.providers.actions.login" }));

    expect(onAuthenticate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "settings.aiChatProviders.providers.switchDialog.confirm" }));
    expect(onAuthenticate).toHaveBeenCalledWith({ providerId: "provider", method: "oauth" });
  });

  it("disables its primary action while another credential operation is pending", () => {
    const method = { kind: "oauth", label: "Subscription" } as const;
    const provider = createProvider({ authMethods: [method] });
    renderControl(provider, method, true);

    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("replaces the pending OAuth action with an enabled Cancel button", () => {
    const method = { kind: "oauth", label: "Subscription" } as const;
    const provider = createProvider({ authMethods: [method] });
    const { onCancelAuthentication } = renderControl(provider, method, true, true);

    const cancelButton = screen.getByRole("button", {
      name: "settings.aiChatProviders.providers.actions.cancel",
    }) as HTMLButtonElement;
    expect(cancelButton.disabled).toBe(false);

    fireEvent.click(cancelButton);
    expect(onCancelAuthentication).toHaveBeenCalledWith("provider");
  });
});

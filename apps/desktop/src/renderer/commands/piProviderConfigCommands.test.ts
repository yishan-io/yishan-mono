// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PiProviderConfigSnapshot } from "../../shared/contracts/piProviderConfig";
import { aiChatSettingsStore } from "../store/settings/aiChatSettingsStore";
import { piProviderConfigStore } from "../store/settings/piProviderConfigStore";
import {
  authenticatePiProvider,
  cancelPiProviderAuthentication,
  getPiProviderConfigSnapshot,
  refreshPiProviderConfigSnapshot,
  removePiProviderCredential,
  respondPiAuthPrompt,
} from "./piProviderConfigCommands";

const mocks = vi.hoisted(() => ({
  authenticatePiProvider: vi.fn(),
  cancelPiProviderAuthentication: vi.fn(),
  getPiProviderConfigSnapshot: vi.fn(),
  refreshPiProviderConfigSnapshot: vi.fn(),
  removePiProviderCredential: vi.fn(),
  respondPiAuthPrompt: vi.fn(),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getDesktopHostBridge: vi.fn(() => ({
    authenticatePiProvider: mocks.authenticatePiProvider,
    cancelPiProviderAuthentication: mocks.cancelPiProviderAuthentication,
    getPiProviderConfigSnapshot: mocks.getPiProviderConfigSnapshot,
    refreshPiProviderConfigSnapshot: mocks.refreshPiProviderConfigSnapshot,
    removePiProviderCredential: mocks.removePiProviderCredential,
    respondPiAuthPrompt: mocks.respondPiAuthPrompt,
  })),
}));

const snapshot: PiProviderConfigSnapshot = {
  providers: [],
  models: [],
};

describe("piProviderConfigCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    piProviderConfigStore.setState({
      snapshot: null,
      loadState: "idle",
      activeLoadRequestId: undefined,
      errorMessage: undefined,
      pendingCredentialAction: undefined,
      activeCredentialRequestId: undefined,
    } as Partial<ReturnType<typeof piProviderConfigStore.getState>>);
    aiChatSettingsStore.setState({ defaultModel: undefined });
  });

  it("authenticates with the selected provider method and clears pending state", async () => {
    mocks.authenticatePiProvider.mockResolvedValue({ ok: true, value: { snapshot } });

    const result = await authenticatePiProvider({ providerId: "anthropic", method: "api_key" });

    expect(mocks.authenticatePiProvider).toHaveBeenCalledWith({ providerId: "anthropic", method: "api_key" });
    expect(result).toBe(snapshot);
    expect(piProviderConfigStore.getState().snapshot).toBe(snapshot);
    expect(piProviderConfigStore.getState().pendingCredentialAction).toBeUndefined();
  });

  it("uses the explicit refresh endpoint while exposing a refresh loading state", async () => {
    let resolveSnapshot: ((value: { ok: true; value: PiProviderConfigSnapshot }) => void) | undefined;
    mocks.refreshPiProviderConfigSnapshot.mockReturnValue(
      new Promise<{ ok: true; value: PiProviderConfigSnapshot }>((resolve) => {
        resolveSnapshot = resolve;
      }),
    );

    const resultPromise = refreshPiProviderConfigSnapshot();

    expect(piProviderConfigStore.getState().loadState).toBe("refreshing");
    expect(mocks.refreshPiProviderConfigSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.getPiProviderConfigSnapshot).not.toHaveBeenCalled();
    resolveSnapshot?.({ ok: true, value: snapshot });
    await expect(resultPromise).resolves.toBe(snapshot);
    expect(piProviderConfigStore.getState().loadState).toBe("idle");
  });

  it("does not let an older snapshot response overwrite a newer refresh", async () => {
    const resolvers: Array<(value: { ok: true; value: PiProviderConfigSnapshot }) => void> = [];
    const loadSnapshot = vi.fn(
      async () =>
        await new Promise<{ ok: true; value: PiProviderConfigSnapshot }>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    mocks.getPiProviderConfigSnapshot.mockImplementation(loadSnapshot);
    mocks.refreshPiProviderConfigSnapshot.mockImplementation(loadSnapshot);
    const olderSnapshot: PiProviderConfigSnapshot = { providers: [], models: [], modelsLoadError: "older" };
    const newerSnapshot: PiProviderConfigSnapshot = { providers: [], models: [], modelsLoadError: "newer" };

    const olderRequest = getPiProviderConfigSnapshot();
    const newerRequest = refreshPiProviderConfigSnapshot();
    resolvers[1]?.({ ok: true, value: newerSnapshot });
    await newerRequest;
    resolvers[0]?.({ ok: true, value: olderSnapshot });
    await olderRequest;

    expect(piProviderConfigStore.getState()).toMatchObject({
      snapshot: newerSnapshot,
      loadState: "idle",
      activeLoadRequestId: undefined,
    });
  });

  it("does not let an older refresh overwrite a credential mutation snapshot", async () => {
    let resolveRefresh: ((value: { ok: true; value: PiProviderConfigSnapshot }) => void) | undefined;
    const staleSnapshot: PiProviderConfigSnapshot = { providers: [], models: [], modelsLoadError: "stale refresh" };
    const mutationSnapshot: PiProviderConfigSnapshot = { providers: [], models: [] };
    mocks.refreshPiProviderConfigSnapshot.mockReturnValue(
      new Promise<{ ok: true; value: PiProviderConfigSnapshot }>((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    mocks.authenticatePiProvider.mockResolvedValue({ ok: true, value: { snapshot: mutationSnapshot } });

    const refresh = refreshPiProviderConfigSnapshot();
    await authenticatePiProvider({ providerId: "anthropic", method: "api_key" });
    resolveRefresh?.({ ok: true, value: staleSnapshot });
    await refresh;

    expect(piProviderConfigStore.getState().snapshot).toBe(mutationSnapshot);
    expect(piProviderConfigStore.getState()).toMatchObject({
      loadState: "idle",
      activeLoadRequestId: undefined,
    });
  });

  it("removes stored credentials and refreshes the provider configuration snapshot", async () => {
    mocks.removePiProviderCredential.mockResolvedValue({ ok: true, value: { snapshot } });

    const result = await removePiProviderCredential("openai");

    expect(mocks.removePiProviderCredential).toHaveBeenCalledWith("openai");
    expect(result).toBe(snapshot);
    expect(piProviderConfigStore.getState().pendingCredentialAction).toBeUndefined();
  });

  it("does not start a second credential mutation while one is still pending", async () => {
    let resolveRemoval: ((value: { ok: true; value: { snapshot: PiProviderConfigSnapshot } }) => void) | undefined;
    mocks.removePiProviderCredential.mockReturnValue(
      new Promise<{ ok: true; value: { snapshot: PiProviderConfigSnapshot } }>((resolve) => {
        resolveRemoval = resolve;
      }),
    );

    const firstRemoval = removePiProviderCredential("openai");
    const secondRemoval = removePiProviderCredential("anthropic");

    await expect(secondRemoval).resolves.toBeNull();
    expect(mocks.removePiProviderCredential).toHaveBeenCalledTimes(1);
    resolveRemoval?.({ ok: true, value: { snapshot } });
    await firstRemoval;
    expect(piProviderConfigStore.getState().pendingCredentialAction).toBeUndefined();
  });

  it("clears a saved default model when a refreshed snapshot no longer makes it available", async () => {
    aiChatSettingsStore.setState({ defaultModel: { providerId: "openai", modelId: "gpt-5" } });
    mocks.getPiProviderConfigSnapshot.mockResolvedValue({ ok: true, value: snapshot });

    await getPiProviderConfigSnapshot();

    expect(aiChatSettingsStore.getState().defaultModel).toBeUndefined();
  });

  it("normalizes authentication errors and always clears pending state", async () => {
    mocks.authenticatePiProvider.mockRejectedValue(new Error("Login failed"));

    const result = await authenticatePiProvider({ providerId: "openai-codex", method: "oauth" });

    expect(result).toBeNull();
    expect(piProviderConfigStore.getState().errorMessage).toBe("Login failed");
    expect(piProviderConfigStore.getState().pendingCredentialAction).toBeUndefined();
  });

  it("returns cancelled authentication to idle without showing an error", async () => {
    mocks.authenticatePiProvider.mockResolvedValue({
      ok: false,
      error: { code: "cancelled", message: "Localized cancellation text" },
    });

    const result = await authenticatePiProvider({ providerId: "anthropic", method: "oauth" });

    expect(result).toBeNull();
    expect(piProviderConfigStore.getState().errorMessage).toBeUndefined();
    expect(piProviderConfigStore.getState().pendingCredentialAction).toBeUndefined();
  });

  it("shows non-cancellation result errors using their stable payload", async () => {
    mocks.authenticatePiProvider.mockResolvedValue({
      ok: false,
      error: { code: "invalid_credential", message: "API key is required." },
    });

    const result = await authenticatePiProvider({ providerId: "anthropic", method: "oauth" });

    expect(result).toBeNull();
    expect(piProviderConfigStore.getState().errorMessage).toBe("API key is required.");
    expect(piProviderConfigStore.getState().pendingCredentialAction).toBeUndefined();
  });

  it("requests cancellation without clearing pending state before authentication settles", async () => {
    mocks.cancelPiProviderAuthentication.mockResolvedValue({ ok: true, value: true });
    piProviderConfigStore.setState({
      pendingCredentialAction: { kind: "authenticate", providerId: "anthropic", method: "oauth" },
    });

    const result = await cancelPiProviderAuthentication("anthropic");

    expect(mocks.cancelPiProviderAuthentication).toHaveBeenCalledWith("anthropic");
    expect(result).toBe(true);
    expect(piProviderConfigStore.getState().pendingCredentialAction).toEqual({
      kind: "authenticate",
      providerId: "anthropic",
      method: "oauth",
    });
  });

  it("normalizes rejected prompt IPC without throwing", async () => {
    mocks.respondPiAuthPrompt.mockRejectedValue(new Error("IPC unavailable"));

    const result = await respondPiAuthPrompt({ requestId: "request-1", status: "cancelled" });

    expect(result).toEqual({ ok: false, errorMessage: "IPC unavailable" });
  });

  it("returns a recoverable error when the prompt is no longer active", async () => {
    mocks.respondPiAuthPrompt.mockResolvedValue({
      ok: false,
      error: {
        code: "operation_failed",
        message: "Authentication prompt is no longer active.",
      },
    });

    const result = await respondPiAuthPrompt({ requestId: "request-1", status: "cancelled" });

    expect(result).toEqual({
      ok: false,
      errorMessage: "Authentication prompt is no longer active.",
    });
  });
});

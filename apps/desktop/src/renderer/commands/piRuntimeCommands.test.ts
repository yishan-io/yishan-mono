// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PiRuntimeSnapshot } from "../../shared/contracts/piRuntime";
import { aiChatSettingsStore } from "../store/settings/aiChatSettingsStore";
import { piRuntimeStore } from "../store/settings/piRuntimeStore";
import {
  authenticatePiProvider,
  cancelPiProviderAuthentication,
  getPiRuntimeSnapshot,
  removePiProviderCredential,
  respondPiAuthPrompt,
} from "./piRuntimeCommands";

const mocks = vi.hoisted(() => ({
  authenticatePiProvider: vi.fn(),
  cancelPiProviderAuthentication: vi.fn(),
  getPiRuntimeSnapshot: vi.fn(),
  removePiProviderCredential: vi.fn(),
  respondPiAuthPrompt: vi.fn(),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getDesktopHostBridge: vi.fn(() => ({
    authenticatePiProvider: mocks.authenticatePiProvider,
    cancelPiProviderAuthentication: mocks.cancelPiProviderAuthentication,
    getPiRuntimeSnapshot: mocks.getPiRuntimeSnapshot,
    removePiProviderCredential: mocks.removePiProviderCredential,
    respondPiAuthPrompt: mocks.respondPiAuthPrompt,
  })),
}));

const snapshot: PiRuntimeSnapshot = {
  providers: [],
  models: [],
};

describe("piRuntimeCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    piRuntimeStore.setState({
      snapshot: null,
      loadState: "idle",
      activeLoadRequestId: undefined,
      errorMessage: undefined,
      pendingCredentialAction: undefined,
      activeCredentialRequestId: undefined,
    } as Partial<ReturnType<typeof piRuntimeStore.getState>>);
    aiChatSettingsStore.setState({ defaultModel: undefined, legacyMigrationCompleted: true });
  });

  it("authenticates with the selected provider method and clears pending state", async () => {
    mocks.authenticatePiProvider.mockResolvedValue({ ok: true, value: { snapshot } });

    const result = await authenticatePiProvider({ providerId: "anthropic", method: "api_key" });

    expect(mocks.authenticatePiProvider).toHaveBeenCalledWith({ providerId: "anthropic", method: "api_key" });
    expect(result).toBe(snapshot);
    expect(piRuntimeStore.getState().snapshot).toBe(snapshot);
    expect(piRuntimeStore.getState().pendingCredentialAction).toBeUndefined();
  });

  it("uses the single snapshot endpoint while exposing a refresh loading state", async () => {
    let resolveSnapshot: ((value: { ok: true; value: PiRuntimeSnapshot }) => void) | undefined;
    mocks.getPiRuntimeSnapshot.mockReturnValue(
      new Promise<{ ok: true; value: PiRuntimeSnapshot }>((resolve) => {
        resolveSnapshot = resolve;
      }),
    );

    const resultPromise = getPiRuntimeSnapshot("refreshing");

    expect(piRuntimeStore.getState().loadState).toBe("refreshing");
    expect(mocks.getPiRuntimeSnapshot).toHaveBeenCalledTimes(1);
    resolveSnapshot?.({ ok: true, value: snapshot });
    await expect(resultPromise).resolves.toBe(snapshot);
    expect(piRuntimeStore.getState().loadState).toBe("idle");
  });

  it("does not let an older snapshot response overwrite a newer refresh", async () => {
    const resolvers: Array<(value: { ok: true; value: PiRuntimeSnapshot }) => void> = [];
    mocks.getPiRuntimeSnapshot.mockImplementation(
      async () =>
        await new Promise<{ ok: true; value: PiRuntimeSnapshot }>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const olderSnapshot: PiRuntimeSnapshot = { providers: [], models: [], modelsLoadError: "older" };
    const newerSnapshot: PiRuntimeSnapshot = { providers: [], models: [], modelsLoadError: "newer" };

    const olderRequest = getPiRuntimeSnapshot();
    const newerRequest = getPiRuntimeSnapshot("refreshing");
    resolvers[1]?.({ ok: true, value: newerSnapshot });
    await newerRequest;
    resolvers[0]?.({ ok: true, value: olderSnapshot });
    await olderRequest;

    expect(piRuntimeStore.getState()).toMatchObject({
      snapshot: newerSnapshot,
      loadState: "idle",
      activeLoadRequestId: undefined,
    });
  });

  it("does not let an older refresh overwrite a credential mutation snapshot", async () => {
    let resolveRefresh: ((value: { ok: true; value: PiRuntimeSnapshot }) => void) | undefined;
    const staleSnapshot: PiRuntimeSnapshot = { providers: [], models: [], modelsLoadError: "stale refresh" };
    const mutationSnapshot: PiRuntimeSnapshot = { providers: [], models: [] };
    mocks.getPiRuntimeSnapshot.mockReturnValue(
      new Promise<{ ok: true; value: PiRuntimeSnapshot }>((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    mocks.authenticatePiProvider.mockResolvedValue({ ok: true, value: { snapshot: mutationSnapshot } });

    const refresh = getPiRuntimeSnapshot("refreshing");
    await authenticatePiProvider({ providerId: "anthropic", method: "api_key" });
    resolveRefresh?.({ ok: true, value: staleSnapshot });
    await refresh;

    expect(piRuntimeStore.getState().snapshot).toBe(mutationSnapshot);
    expect(piRuntimeStore.getState()).toMatchObject({
      loadState: "idle",
      activeLoadRequestId: undefined,
    });
  });

  it("removes stored credentials and refreshes the runtime snapshot", async () => {
    mocks.removePiProviderCredential.mockResolvedValue({ ok: true, value: { snapshot } });

    const result = await removePiProviderCredential("openai");

    expect(mocks.removePiProviderCredential).toHaveBeenCalledWith("openai");
    expect(result).toBe(snapshot);
    expect(piRuntimeStore.getState().pendingCredentialAction).toBeUndefined();
  });

  it("does not start a second credential mutation while one is still pending", async () => {
    let resolveRemoval: ((value: { ok: true; value: { snapshot: PiRuntimeSnapshot } }) => void) | undefined;
    mocks.removePiProviderCredential.mockReturnValue(
      new Promise<{ ok: true; value: { snapshot: PiRuntimeSnapshot } }>((resolve) => {
        resolveRemoval = resolve;
      }),
    );

    const firstRemoval = removePiProviderCredential("openai");
    const secondRemoval = removePiProviderCredential("anthropic");

    await expect(secondRemoval).resolves.toBeNull();
    expect(mocks.removePiProviderCredential).toHaveBeenCalledTimes(1);
    resolveRemoval?.({ ok: true, value: { snapshot } });
    await firstRemoval;
    expect(piRuntimeStore.getState().pendingCredentialAction).toBeUndefined();
  });

  it("clears a saved default model when a refreshed snapshot no longer makes it available", async () => {
    aiChatSettingsStore.setState({ defaultModel: { providerId: "openai", modelId: "gpt-5" } });
    mocks.getPiRuntimeSnapshot.mockResolvedValue({ ok: true, value: snapshot });

    await getPiRuntimeSnapshot();

    expect(aiChatSettingsStore.getState().defaultModel).toBeUndefined();
  });

  it("normalizes authentication errors and always clears pending state", async () => {
    mocks.authenticatePiProvider.mockRejectedValue(new Error("Login failed"));

    const result = await authenticatePiProvider({ providerId: "openai-codex", method: "oauth" });

    expect(result).toBeNull();
    expect(piRuntimeStore.getState().errorMessage).toBe("Login failed");
    expect(piRuntimeStore.getState().pendingCredentialAction).toBeUndefined();
  });

  it("returns cancelled authentication to idle without showing an error", async () => {
    mocks.authenticatePiProvider.mockResolvedValue({
      ok: false,
      error: { code: "cancelled", message: "Localized cancellation text" },
    });

    const result = await authenticatePiProvider({ providerId: "anthropic", method: "oauth" });

    expect(result).toBeNull();
    expect(piRuntimeStore.getState().errorMessage).toBeUndefined();
    expect(piRuntimeStore.getState().pendingCredentialAction).toBeUndefined();
  });

  it("shows non-cancellation result errors using their stable payload", async () => {
    mocks.authenticatePiProvider.mockResolvedValue({
      ok: false,
      error: { code: "invalid_credential", message: "API key is required." },
    });

    const result = await authenticatePiProvider({ providerId: "anthropic", method: "oauth" });

    expect(result).toBeNull();
    expect(piRuntimeStore.getState().errorMessage).toBe("API key is required.");
    expect(piRuntimeStore.getState().pendingCredentialAction).toBeUndefined();
  });

  it("requests cancellation without clearing pending state before authentication settles", async () => {
    mocks.cancelPiProviderAuthentication.mockResolvedValue({ ok: true, value: true });
    piRuntimeStore.setState({
      pendingCredentialAction: { kind: "authenticate", providerId: "anthropic", method: "oauth" },
    });

    const result = await cancelPiProviderAuthentication("anthropic");

    expect(mocks.cancelPiProviderAuthentication).toHaveBeenCalledWith("anthropic");
    expect(result).toBe(true);
    expect(piRuntimeStore.getState().pendingCredentialAction).toEqual({
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

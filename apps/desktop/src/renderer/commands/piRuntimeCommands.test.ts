// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PiRuntimeSnapshot } from "../../main/piRuntime/piRuntimeTypes";
import { piRuntimeStore } from "../store/settings/piRuntimeStore";
import {
  authenticatePiProvider,
  cancelPiProviderAuthentication,
  removePiProviderCredential,
  respondPiAuthPrompt,
} from "./piRuntimeCommands";

const mocks = vi.hoisted(() => ({
  authenticatePiProvider: vi.fn(),
  cancelPiProviderAuthentication: vi.fn(),
  removePiProviderCredential: vi.fn(),
  respondPiAuthPrompt: vi.fn(),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getDesktopHostBridge: vi.fn(() => ({
    authenticatePiProvider: mocks.authenticatePiProvider,
    cancelPiProviderAuthentication: mocks.cancelPiProviderAuthentication,
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
      errorMessage: undefined,
      pendingCredentialAction: undefined,
    } as Partial<ReturnType<typeof piRuntimeStore.getState>>);
  });

  it("authenticates with the selected provider method and clears pending state", async () => {
    mocks.authenticatePiProvider.mockResolvedValue({ ok: true, snapshot });

    const result = await authenticatePiProvider({ providerId: "anthropic", method: "api_key" });

    expect(mocks.authenticatePiProvider).toHaveBeenCalledWith({ providerId: "anthropic", method: "api_key" });
    expect(result).toBe(snapshot);
    expect(piRuntimeStore.getState().snapshot).toBe(snapshot);
    expect(piRuntimeStore.getState().pendingCredentialAction).toBeUndefined();
  });

  it("removes stored credentials and refreshes the runtime snapshot", async () => {
    mocks.removePiProviderCredential.mockResolvedValue({ ok: true, snapshot });

    const result = await removePiProviderCredential("openai");

    expect(mocks.removePiProviderCredential).toHaveBeenCalledWith("openai");
    expect(result).toBe(snapshot);
    expect(piRuntimeStore.getState().pendingCredentialAction).toBeUndefined();
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
    mocks.cancelPiProviderAuthentication.mockResolvedValue({ ok: true });
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
    mocks.respondPiAuthPrompt.mockResolvedValue({ ok: false });

    const result = await respondPiAuthPrompt({ requestId: "request-1", status: "cancelled" });

    expect(result).toEqual({
      ok: false,
      errorMessage: "Authentication prompt is no longer active. Please retry.",
    });
  });
});

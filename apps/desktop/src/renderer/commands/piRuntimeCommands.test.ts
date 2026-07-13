// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PiRuntimeSnapshot } from "../../main/piRuntime/piRuntimeTypes";
import { piRuntimeStore } from "../store/settings/piRuntimeStore";
import {
  authenticatePiProvider,
  cancelPiProviderAuthentication,
  removePiProviderCredential,
} from "./piRuntimeCommands";

const mocks = vi.hoisted(() => ({
  authenticatePiProvider: vi.fn(),
  cancelPiProviderAuthentication: vi.fn(),
  removePiProviderCredential: vi.fn(),
}));

vi.mock("../rpc/rpcTransport", () => ({
  getDesktopHostBridge: vi.fn(() => ({
    authenticatePiProvider: mocks.authenticatePiProvider,
    cancelPiProviderAuthentication: mocks.cancelPiProviderAuthentication,
    removePiProviderCredential: mocks.removePiProviderCredential,
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
    mocks.authenticatePiProvider.mockResolvedValue(snapshot);

    const result = await authenticatePiProvider({ providerId: "anthropic", method: "api_key" });

    expect(mocks.authenticatePiProvider).toHaveBeenCalledWith({ providerId: "anthropic", method: "api_key" });
    expect(result).toBe(snapshot);
    expect(piRuntimeStore.getState().snapshot).toBe(snapshot);
    expect(piRuntimeStore.getState().pendingCredentialAction).toBeUndefined();
  });

  it("removes stored credentials and refreshes the runtime snapshot", async () => {
    mocks.removePiProviderCredential.mockResolvedValue(snapshot);

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
    mocks.authenticatePiProvider.mockRejectedValue(new Error("Login cancelled."));

    const result = await authenticatePiProvider({ providerId: "anthropic", method: "oauth" });

    expect(result).toBeNull();
    expect(piRuntimeStore.getState().errorMessage).toBeUndefined();
    expect(piRuntimeStore.getState().pendingCredentialAction).toBeUndefined();
  });

  it("does not show Electron-wrapped authentication cancellation as an error", async () => {
    mocks.authenticatePiProvider.mockRejectedValue(
      new Error("Error invoking remote method 'desktop:host/authenticate-pi-provider': Error: Login cancelled."),
    );

    const result = await authenticatePiProvider({ providerId: "anthropic", method: "oauth" });

    expect(result).toBeNull();
    expect(piRuntimeStore.getState().errorMessage).toBeUndefined();
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
});

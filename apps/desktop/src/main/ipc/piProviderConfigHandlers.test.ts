import { beforeEach, describe, expect, it, vi } from "vitest";
import { HOST_IPC_CHANNELS } from "../ipc";
import type { PiProviderConfigService } from "../piProviderConfig/piProviderConfigService";
import { registerPiProviderConfigIpcHandlers } from "./piProviderConfigHandlers";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, input?: unknown) => Promise<unknown>>(),
  fromWebContents: vi.fn(),
}));

vi.mock("electron", () => ({
  BrowserWindow: { fromWebContents: mocks.fromWebContents },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, input?: unknown) => Promise<unknown>) => {
      mocks.handlers.set(channel, handler);
    },
  },
}));

function createService(overrides: Partial<PiProviderConfigService> = {}): PiProviderConfigService {
  return {
    getSnapshot: vi.fn(async () => ({ providers: [], models: [] })),
    refreshSnapshot: vi.fn(async () => ({ providers: [], models: [] })),
    authenticate: vi.fn(),
    removeCredential: vi.fn(),
    ...overrides,
  } as unknown as PiProviderConfigService;
}

function getHandler(channel: string) {
  const handler = mocks.handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing IPC handler: ${channel}`);
  }
  return handler;
}

describe("registerPiProviderConfigIpcHandlers", () => {
  beforeEach(() => {
    mocks.handlers.clear();
    vi.clearAllMocks();
  });

  it("uses the provider-config snapshot IPC channel name", () => {
    expect(HOST_IPC_CHANNELS.getPiProviderConfigSnapshot).toBe("desktop:host/get-pi-provider-config-snapshot");
  });

  it.each([
    [HOST_IPC_CHANNELS.authenticatePiProvider, { providerId: "", method: "oauth" }],
    [HOST_IPC_CHANNELS.cancelPiProviderAuthentication, ""],
    [HOST_IPC_CHANNELS.respondPiAuthPrompt, { requestId: "request-1", status: "submitted" }],
    [HOST_IPC_CHANNELS.removePiProviderCredential, 42],
  ])("rejects malformed input for %s before calling the runtime service", async (channel, input) => {
    const service = createService();
    registerPiProviderConfigIpcHandlers(service, () => null);

    const result = await getHandler(channel)({ sender: { id: 1 } }, input);

    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(service.authenticate).not.toHaveBeenCalled();
    expect(service.removeCredential).not.toHaveBeenCalled();
  });

  it("returns a safe structured error without logging raw provider details", async () => {
    const service = createService({
      getSnapshot: vi.fn(async () => {
        throw new Error("provider secret sk-sensitive");
      }),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    registerPiProviderConfigIpcHandlers(service, () => null);

    const result = await getHandler(HOST_IPC_CHANNELS.getPiProviderConfigSnapshot)({ sender: { id: 1 } });

    expect(result).toEqual({
      ok: false,
      error: { code: "operation_failed", message: "The provider operation failed. Please try again." },
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("sk-sensitive");
  });

  it("uses an explicit refresh endpoint to reload Pi provider configuration", async () => {
    const service = createService();
    registerPiProviderConfigIpcHandlers(service, () => null);

    const result = await getHandler(HOST_IPC_CHANNELS.refreshPiProviderConfigSnapshot)({ sender: { id: 1 } });

    expect(result).toEqual({ ok: true, value: { providers: [], models: [] } });
    expect(service.refreshSnapshot).toHaveBeenCalledOnce();
    expect(service.getSnapshot).not.toHaveBeenCalled();
  });

  it("keeps authentication successful when the follow-up snapshot refresh fails", async () => {
    const service = createService({
      authenticate: vi.fn(async () => undefined),
      refreshSnapshot: vi.fn(async () => {
        throw new Error("provider secret sk-refresh");
      }),
    });
    mocks.fromWebContents.mockReturnValue({ webContents: { send: vi.fn() } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    registerPiProviderConfigIpcHandlers(service, () => null);

    const result = await getHandler(HOST_IPC_CHANNELS.authenticatePiProvider)(
      { sender: { id: 1, once: vi.fn(), removeListener: vi.fn() } },
      { providerId: "openai", method: "api_key" },
    );

    expect(result).toEqual({
      ok: true,
      value: {
        refreshError: {
          code: "snapshot_refresh_failed",
          message: "Credential updated, but provider and model status could not be refreshed. Refresh to try again.",
        },
      },
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("sk-refresh");
  });

  it("ends authentication before refreshing the post-login snapshot", async () => {
    let resolveSnapshot: (() => void) | undefined;
    const refreshSnapshot = vi.fn(
      async () =>
        await new Promise<{ providers: []; models: [] }>((resolve) => {
          resolveSnapshot = () => resolve({ providers: [], models: [] });
        }),
    );
    const service = createService({ authenticate: vi.fn(async () => undefined), refreshSnapshot });
    mocks.fromWebContents.mockReturnValue({ webContents: { send: vi.fn() } });
    registerPiProviderConfigIpcHandlers(service, () => null);
    const sender = { id: 1, once: vi.fn(), removeListener: vi.fn() };

    const authentication = getHandler(HOST_IPC_CHANNELS.authenticatePiProvider)(
      { sender },
      { providerId: "openai", method: "api_key" },
    );
    await vi.waitFor(() => expect(refreshSnapshot).toHaveBeenCalledOnce());

    const callbacks = vi.mocked(service.authenticate).mock.calls[0]?.[2];
    expect(callbacks?.signal?.aborted).toBe(true);
    await expect(getHandler(HOST_IPC_CHANNELS.cancelPiProviderAuthentication)({ sender }, "openai")).resolves.toEqual({
      ok: true,
      value: false,
    });

    resolveSnapshot?.();
    await expect(authentication).resolves.toEqual({
      ok: true,
      value: { snapshot: { providers: [], models: [] } },
    });
  });

  it("keeps credential removal successful when the follow-up snapshot refresh fails", async () => {
    const service = createService({
      removeCredential: vi.fn(async () => undefined),
      refreshSnapshot: vi.fn(async () => {
        throw new Error("provider secret sk-refresh");
      }),
    });
    registerPiProviderConfigIpcHandlers(service, () => null);

    const result = await getHandler(HOST_IPC_CHANNELS.removePiProviderCredential)({ sender: { id: 1 } }, "openai");

    expect(result).toEqual({
      ok: true,
      value: {
        refreshError: {
          code: "snapshot_refresh_failed",
          message: "Credential updated, but provider and model status could not be refreshed. Refresh to try again.",
        },
      },
    });
  });
});

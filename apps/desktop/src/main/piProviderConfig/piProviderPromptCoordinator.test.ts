import { describe, expect, it, vi } from "vitest";
import { DESKTOP_RPC_IPC_CHANNELS } from "../ipc";
import { PiProviderPromptCoordinator } from "./piProviderPromptCoordinator";

function createTarget(id = 7) {
  const destroyedListeners = new Set<() => void>();
  return {
    target: {
      id,
      isDestroyed: () => false,
      send: vi.fn(),
      once: (_event: "destroyed", listener: () => void) => destroyedListeners.add(listener),
      removeListener: (_event: "destroyed", listener: () => void) => destroyedListeners.delete(listener),
    },
    destroy: () => {
      for (const listener of destroyedListeners) {
        listener();
      }
    },
  };
}

function getSentPromptEnvelope(target: ReturnType<typeof createTarget>["target"]) {
  const call = target.send.mock.calls[0];
  if (!call) {
    throw new Error("Expected the prompt event to be sent");
  }
  return call[1];
}

describe("PiProviderPromptCoordinator", () => {
  it("correlates a submitted renderer response with its pending prompt", async () => {
    const coordinator = new PiProviderPromptCoordinator();
    const { target } = createTarget();

    const resultPromise = coordinator.request(target, { type: "secret", message: "Enter API key" });
    const envelope = getSentPromptEnvelope(target);

    expect(target.send).toHaveBeenCalledWith(
      DESKTOP_RPC_IPC_CHANNELS.event,
      expect.objectContaining({ method: "piProviderConfig.authPrompt" }),
    );
    expect(
      coordinator.respond(target.id + 1, { requestId: envelope.payload.requestId, status: "submitted", value: "bad" }),
    ).toBe(false);
    expect(
      coordinator.respond(target.id, { requestId: envelope.payload.requestId, status: "submitted", value: "secret" }),
    ).toBe(true);
    await expect(resultPromise).resolves.toBe("secret");
  });

  it("rejects a cancelled prompt without returning an empty credential", async () => {
    const coordinator = new PiProviderPromptCoordinator();
    const { target } = createTarget();

    const resultPromise = coordinator.request(target, { type: "text", message: "Enter domain" });
    const envelope = getSentPromptEnvelope(target);
    coordinator.respond(target.id, { requestId: envelope.payload.requestId, status: "cancelled" });

    await expect(resultPromise).rejects.toThrow("Login cancelled.");
  });

  it("accepts only values offered by a select prompt", async () => {
    const coordinator = new PiProviderPromptCoordinator();
    const { target } = createTarget();
    const resultPromise = coordinator.request(target, {
      type: "select",
      message: "Choose a login method",
      options: [
        { id: "browser", label: "Browser" },
        { id: "device_code", label: "Device code" },
      ],
    });
    const envelope = getSentPromptEnvelope(target);

    expect(
      coordinator.respond(target.id, {
        requestId: envelope.payload.requestId,
        status: "submitted",
        value: "untrusted-option",
      }),
    ).toBe(false);
    expect(
      coordinator.respond(target.id, {
        requestId: envelope.payload.requestId,
        status: "submitted",
        value: "browser",
      }),
    ).toBe(true);
    await expect(resultPromise).resolves.toBe("browser");
  });

  it("dismisses a pending renderer prompt when its provider signal is aborted", async () => {
    const coordinator = new PiProviderPromptCoordinator();
    const { target } = createTarget();
    const controller = new AbortController();

    const resultPromise = coordinator.request(
      target,
      { type: "text", message: "Paste the redirect URL" },
      controller.signal,
    );
    const envelope = getSentPromptEnvelope(target);
    controller.abort();

    await expect(resultPromise).rejects.toThrow("Login cancelled.");
    expect(target.send).toHaveBeenLastCalledWith(DESKTOP_RPC_IPC_CHANNELS.event, {
      method: "piProviderConfig.authPromptClosed",
      payload: { requestId: envelope.payload.requestId },
    });
  });
});

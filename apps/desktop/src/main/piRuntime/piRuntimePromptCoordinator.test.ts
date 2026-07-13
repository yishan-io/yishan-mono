import { describe, expect, it, vi } from "vitest";
import { DESKTOP_RPC_IPC_CHANNELS } from "../ipc";
import { PiRuntimePromptCoordinator } from "./piRuntimePromptCoordinator";

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

describe("PiRuntimePromptCoordinator", () => {
  it("correlates a submitted renderer response with its pending prompt", async () => {
    const coordinator = new PiRuntimePromptCoordinator();
    const { target } = createTarget();

    const resultPromise = coordinator.request(target, { type: "secret", message: "Enter API key" });
    const envelope = getSentPromptEnvelope(target);

    expect(target.send).toHaveBeenCalledWith(
      DESKTOP_RPC_IPC_CHANNELS.event,
      expect.objectContaining({ method: "piRuntime.authPrompt" }),
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
    const coordinator = new PiRuntimePromptCoordinator();
    const { target } = createTarget();

    const resultPromise = coordinator.request(target, { type: "text", message: "Enter domain" });
    const envelope = getSentPromptEnvelope(target);
    coordinator.respond(target.id, { requestId: envelope.payload.requestId, status: "cancelled" });

    await expect(resultPromise).rejects.toThrow("Login cancelled.");
  });
});

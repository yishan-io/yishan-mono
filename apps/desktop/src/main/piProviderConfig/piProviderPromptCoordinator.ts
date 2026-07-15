import type { PiAuthPromptRequest, PiAuthPromptResponseInput } from "../../shared/contracts/piProviderConfig";
import { generateId } from "../../shared/helpers/generateId";
import { DESKTOP_RPC_IPC_CHANNELS } from "../ipc";
import { PiProviderConfigError, createPiProviderConfigCancellationError } from "./piProviderConfigErrors";

/** Renderer target capable of receiving and owning one Pi authentication prompt. */
export type PiAuthPromptTarget = {
  id: number;
  isDestroyed: () => boolean;
  send: (channel: string, envelope: { method: string; payload: unknown }) => void;
  once: (event: "destroyed", listener: () => void) => void;
  removeListener: (event: "destroyed", listener: () => void) => void;
};

type PendingPrompt = {
  requestId: string;
  prompt: PiAuthPromptRequest;
  target: PiAuthPromptTarget;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  onDestroyed: () => void;
  signal?: AbortSignal;
  onAborted?: () => void;
};

/** Coordinates one renderer-owned Pi auth prompt without exposing credentials outside the response IPC. */
export class PiProviderPromptCoordinator {
  private pendingPrompt: PendingPrompt | undefined;

  async request(target: PiAuthPromptTarget, prompt: PiAuthPromptRequest, signal?: AbortSignal): Promise<string> {
    if (this.pendingPrompt) {
      throw new PiProviderConfigError("authentication_in_progress", "Provider authentication prompt is already open.");
    }
    if (target.isDestroyed() || signal?.aborted) {
      throw createPiProviderConfigCancellationError();
    }

    const requestId = generateId();
    return await new Promise<string>((resolve, reject) => {
      const onDestroyed = () => this.rejectPending(createPiProviderConfigCancellationError());
      const onAborted = signal ? () => this.rejectPending(createPiProviderConfigCancellationError(), true) : undefined;
      this.pendingPrompt = { requestId, prompt, target, resolve, reject, onDestroyed, signal, onAborted };
      target.once("destroyed", onDestroyed);
      if (signal && onAborted) {
        signal.addEventListener("abort", onAborted, { once: true });
      }
      try {
        target.send(DESKTOP_RPC_IPC_CHANNELS.event, {
          method: "piRuntime.authPrompt",
          payload: { requestId, prompt },
        });
      } catch {
        this.rejectPending(createPiProviderConfigCancellationError());
      }
    });
  }

  /** Resolves a pending request only when both request ID and renderer sender match. */
  respond(senderId: number, response: PiAuthPromptResponseInput): boolean {
    const pending = this.pendingPrompt;
    if (!pending || pending.target.id !== senderId || pending.requestId !== response.requestId) {
      return false;
    }

    if (response.status === "cancelled") {
      this.rejectPending(createPiProviderConfigCancellationError());
      return true;
    }

    const value = response.value.trim();
    if (pending.prompt.type === "select" && !pending.prompt.options.some((option) => option.id === value)) {
      return false;
    }
    if (pending.prompt.type !== "select" && value.length === 0) {
      this.rejectPending(createPiProviderConfigCancellationError());
      return true;
    }

    this.clearPending();
    pending.resolve(value);
    return true;
  }

  private rejectPending(error: Error, notifyRenderer = false): void {
    const pending = this.pendingPrompt;
    if (!pending) {
      return;
    }
    if (notifyRenderer && !pending.target.isDestroyed()) {
      try {
        pending.target.send(DESKTOP_RPC_IPC_CHANNELS.event, {
          method: "piRuntime.authPromptClosed",
          payload: { requestId: pending.requestId },
        });
      } catch {
        console.warn("Failed to close a renderer Pi authentication prompt");
      }
    }
    this.clearPending();
    pending.reject(error);
  }

  private clearPending(): void {
    const pending = this.pendingPrompt;
    if (!pending) {
      return;
    }
    pending.target.removeListener("destroyed", pending.onDestroyed);
    if (pending.signal && pending.onAborted) {
      pending.signal.removeEventListener("abort", pending.onAborted);
    }
    this.pendingPrompt = undefined;
  }
}

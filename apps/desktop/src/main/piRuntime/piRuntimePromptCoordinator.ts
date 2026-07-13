import { generateId } from "../../shared/helpers/generateId";
import { DESKTOP_RPC_IPC_CHANNELS } from "../ipc";
import type { PiAuthPromptRequest, PiAuthPromptResponseInput } from "./piRuntimeTypes";

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
};

/** Coordinates one renderer-owned Pi auth prompt without exposing credentials outside the response IPC. */
export class PiRuntimePromptCoordinator {
  private pendingPrompt: PendingPrompt | undefined;

  async request(target: PiAuthPromptTarget, prompt: PiAuthPromptRequest): Promise<string> {
    if (this.pendingPrompt) {
      throw new Error("Provider authentication prompt is already open.");
    }
    if (target.isDestroyed()) {
      throw new Error("Login cancelled.");
    }

    const requestId = generateId();
    return await new Promise<string>((resolve, reject) => {
      const onDestroyed = () => this.rejectPending(new Error("Login cancelled."));
      this.pendingPrompt = { requestId, prompt, target, resolve, reject, onDestroyed };
      target.once("destroyed", onDestroyed);
      try {
        target.send(DESKTOP_RPC_IPC_CHANNELS.event, {
          method: "piRuntime.authPrompt",
          payload: { requestId, prompt },
        });
      } catch {
        this.rejectPending(new Error("Login cancelled."));
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
      this.rejectPending(new Error("Login cancelled."));
      return true;
    }

    const value = response.value.trim();
    if (pending.prompt.type !== "select" && !pending.prompt.allowEmpty && value.length === 0) {
      this.rejectPending(new Error("Login cancelled."));
      return true;
    }

    this.clearPending();
    pending.resolve(value);
    return true;
  }

  private rejectPending(error: Error): void {
    const pending = this.pendingPrompt;
    if (!pending) {
      return;
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
    this.pendingPrompt = undefined;
  }
}

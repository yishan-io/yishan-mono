import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AgentParentCorrelation, AgentTerminalEvent } from "../delegation";
import { buildCompletionMessage } from "./completionMessage";

const RETRY_DELAYS_MS = [100, 500, 1500] as const;
interface DeliveryEntry {
  state: "enrolled" | "pending" | "sending" | "accepted";
  event?: AgentTerminalEvent;
  retries: number;
  timer?: ReturnType<typeof setTimeout>;
  exhausted?: boolean;
}

/** Immutable parent identity and synchronous Pi acceptance boundary. */
export interface CompletionOwnerOptions {
  sessionId: string;
  lifetime: string;
  send: ExtensionAPI["sendMessage"];
  warn: (message: string) => void;
}

/** Process-local delivery claims for exactly one immutable parent lifetime. */
export class CompletionOwner {
  readonly parent: Readonly<AgentParentCorrelation>;
  private readonly entries = new Map<string, DeliveryEntry>();
  private closed = false;
  private draining = false;
  constructor(private readonly options: CompletionOwnerOptions) {
    this.parent = Object.freeze({ sessionId: options.sessionId, lifetime: options.lifetime });
  }
  /** Whether admission and delivery still belong to this lifetime. */
  get isClosed(): boolean {
    return this.closed;
  }

  /** Called synchronously by core admission, before any child work. */
  enroll(agentId: string): void {
    if (!this.closed && !this.entries.has(agentId)) this.entries.set(agentId, { state: "enrolled", retries: 0 });
  }

  /** Receives future terminal events only; history is never scanned for detachment. */
  terminal(event: AgentTerminalEvent): void {
    if (
      this.closed ||
      event.parent?.sessionId !== this.parent.sessionId ||
      event.parent?.lifetime !== this.parent.lifetime
    )
      return;
    const entry = this.entries.get(event.result.agentId);
    if (!entry || entry.state !== "enrolled") return;
    entry.event = event;
    entry.state = "pending";
    this.drain();
  }

  /** Permanently suppresses late events and retries before manager teardown begins. */
  close(): void {
    this.closed = true;
    for (const entry of this.entries.values()) this.clearTimer(entry);
    this.entries.clear();
  }

  private drain(): void {
    if (this.closed || this.draining) return;
    this.draining = true;
    try {
      // Map iteration also visits terminals admitted reentrantly during send.
      for (const entry of this.entries.values()) {
        if (this.closed) break;
        if (entry.state !== "pending" || entry.timer || entry.exhausted) continue;
        this.send(entry);
      }
      // Reentrant terminals can update an entry already visited in the iteration.
      if (!this.closed && [...this.entries.values()].some((e) => e.state === "pending" && !e.timer && !e.exhausted)) {
        this.draining = false;
        this.drain();
      }
    } finally {
      this.draining = false;
    }
  }

  private send(entry: DeliveryEntry): void {
    const event = entry.event;
    if (!event) return;
    entry.state = "sending";
    try {
      this.options.send(buildCompletionMessage(event.result), {
        deliverAs: "followUp",
        triggerTurn: event.result.cancellationOrigin !== "user",
      });
      entry.state = "accepted";
    } catch {
      if (this.closed) return;
      entry.state = "pending";
      const delay = RETRY_DELAYS_MS[entry.retries++];
      if (delay === undefined) {
        entry.exhausted = true;
        this.options.warn(
          `Sub-agent completion delivery failed after automatic retries. Inspect with /agent-result ${event.result.agentId}.`,
        );
        return;
      }
      entry.timer = setTimeout(() => {
        entry.timer = undefined;
        if (!this.closed) this.drain();
      }, delay);
    }
  }

  private clearTimer(entry: DeliveryEntry): void {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = undefined;
  }
}

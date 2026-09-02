import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { type Scoped, carrierKeyOf } from "@deepseek-ai/dsh-scope";
import type { SubagentRunEndInfo, SubagentRunInfo } from "@deepseek-ai/dsh-subagent";
import type { BridgeNotificationSink } from "@yishan-io/dsh-daemon-bridge";

import { YISHAN_NOTIFICATIONS } from "@yishan-io/dsh-daemon-bridge";
import type { SessionRuntime } from "./session/runtime";

const LIFECYCLE_VERSION = 1;
const STOP_REASONS = new Set(["completed", "aborted", "error", "max-tokens", "refusal"]);

type LifecycleStopReason = "completed" | "aborted" | "error" | "max-tokens" | "refusal";

/** Forwards DSH subagent lifecycle events for Yishan-owned sessions to the daemon. */
export class SubagentLifecycleNotifier {
  private readonly revisions = new Map<string, number>();

  /** Creates a publisher bound to one runtime instance and transport. */
  constructor(
    private readonly ctx: Context,
    private readonly runtime: SessionRuntime,
    private readonly transport: BridgeNotificationSink,
  ) {}

  /** Subscribes the publisher to Cordis subagent lifecycle events. */
  subscribe(): void {
    const publisher = this;
    this.ctx.on("subagent/start", function (info) {
      publisher.publish(this, info, "started");
    });
    this.ctx.on("subagent/end", function (info) {
      publisher.publish(this, info, "finished", publisher.normalizeStopReason(info.stopReason));
    });
  }

  private publish(
    carrier: Scoped<object>,
    info: SubagentRunInfo | SubagentRunEndInfo,
    event: "started" | "finished",
    stopReason?: LifecycleStopReason,
  ): void {
    const parentSessionId = this.getParentSessionId(carrier);
    const childSessionId = this.getNonEmptyString(info.id);
    const runId = this.getNonEmptyString(info.runId);
    const provider = this.getNonEmptyString(info.provider);
    if (!parentSessionId || !this.runtime.owns(parentSessionId) || !childSessionId || !runId || !provider) return;
    const revision = this.revisions.get(parentSessionId) ?? 0;
    this.revisions.set(parentSessionId, revision + 1);
    this.transport.notify(
      YISHAN_NOTIFICATIONS.subagentLifecycle as never,
      {
        version: LIFECYCLE_VERSION,
        parentSessionId,
        instanceId: this.runtime.getInstanceId(),
        revision,
        event,
        runId,
        childSessionId,
        provider,
        local: info.local,
        ...(stopReason === undefined ? {} : { stopReason }),
      } as never,
    );
  }

  private normalizeStopReason(stopReason: string): LifecycleStopReason {
    return STOP_REASONS.has(stopReason) ? (stopReason as LifecycleStopReason) : "error";
  }

  private getParentSessionId(carrier: Scoped<object>): string | undefined {
    const parent = carrierKeyOf(carrier);
    if (!this.isAgent(parent) || parent.id !== parent.session.id) return undefined;
    return this.getNonEmptyString(parent.session.id);
  }

  private isAgent(value: unknown): value is Agent {
    return value !== null && typeof value === "object" && "id" in value && "session" in value;
  }

  private getNonEmptyString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }
}

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
      // fire-and-forget: lifecycle publication cannot block the Cordis event loop.
      void publisher
        .publish(this, info, "started")
        .catch((error: unknown) => console.error("subagent start publish failed", error));
    });
    this.ctx.on("subagent/end", function (info) {
      // fire-and-forget: settlement flush cannot block the Cordis event loop.
      void publisher
        .publish(this, info, "finished", publisher.normalizeStopReason(info.stopReason))
        .catch((error: unknown) => console.error("subagent completion publish failed", error));
    });
  }

  private async publish(
    carrier: Scoped<object>,
    info: SubagentRunInfo | SubagentRunEndInfo,
    event: "started" | "finished",
    stopReason?: LifecycleStopReason,
  ): Promise<void> {
    const parentSessionId = this.getParentSessionId(carrier);
    const childSessionId = this.getNonEmptyString(info.id);
    const runId = this.getNonEmptyString(info.runId);
    const provider = this.getNonEmptyString(info.provider);
    if (!parentSessionId || !this.runtime.owns(parentSessionId) || !childSessionId || !runId || !provider) return;
    if (event === "finished" && stopReason !== undefined) {
      const settlement = toSettlement(stopReason);
      if (settlement.diagnostic === undefined) {
        await this.runtime.recordSubagentSettlement(parentSessionId, childSessionId, settlement.state);
      } else {
        await this.runtime.recordSubagentSettlement(
          parentSessionId,
          childSessionId,
          settlement.state,
          settlement.diagnostic,
        );
      }
    }
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

function toSettlement(stopReason: LifecycleStopReason): {
  state: "completed" | "aborted" | "error";
  diagnostic?: { reason: "aborted" | "error" | "max-tokens" | "refusal" };
} {
  if (stopReason === "completed") return { state: "completed" };
  if (stopReason === "aborted") return { state: "aborted", diagnostic: { reason: "aborted" } };
  if (stopReason === "max-tokens" || stopReason === "refusal") {
    return { state: "error", diagnostic: { reason: stopReason } };
  }
  return { state: "error", diagnostic: { reason: "error" } };
}

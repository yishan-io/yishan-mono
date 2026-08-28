import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { carrierKeyOf } from "@deepseek-ai/dsh-scope";
import type { Scoped } from "@deepseek-ai/dsh-scope";
import type { SubagentRunEndInfo, SubagentRunInfo } from "@deepseek-ai/dsh-subagent";

import { YISHAN_NOTIFICATIONS } from "./protocol";

const LIFECYCLE_VERSION = 1;
type LifecycleStopReason = NonNullable<SubagentLifecycleNotification["stopReason"]>;

const STOP_REASONS = new Set<LifecycleStopReason>(["completed", "aborted", "error", "max-tokens", "refusal"]);

/** Live-only notification for one DSH child-run lifecycle edge. */
export type SubagentLifecycleNotification = {
  version: 1;
  parentSessionId: string;
  incarnation: string;
  revision: number;
  event: "started" | "finished";
  runId: string;
  childSessionId: string;
  provider: string;
  local: boolean;
  stopReason?: "completed" | "aborted" | "error" | "max-tokens" | "refusal";
};

type LifecycleDependencies = {
  incarnation: string;
  notify(method: string, payload: SubagentLifecycleNotification): void;
};

/** Registers public scoped DSH subagent lifecycle edges as runtime notifications. */
export function installSubagentLifecycleNotifications(ctx: Context, dependencies: LifecycleDependencies): void {
  const publisher = new SubagentLifecyclePublisher(dependencies);
  ctx.on("subagent/start", function (info) {
    publisher.publishStarted(this, info);
  });
  ctx.on("subagent/end", function (info) {
    publisher.publishFinished(this, info);
  });
}

class SubagentLifecyclePublisher {
  private readonly revisions = new Map<string, number>();

  constructor(private readonly dependencies: LifecycleDependencies) {}

  publishStarted(carrier: Scoped<object>, info: SubagentRunInfo): void {
    this.publish(carrier, info, "started");
  }

  publishFinished(carrier: Scoped<object>, info: SubagentRunEndInfo): void {
    this.publish(carrier, info, "finished", normalizeStopReason(info.stopReason));
  }

  private publish(
    carrier: Scoped<object>,
    info: SubagentRunInfo | SubagentRunEndInfo,
    event: "started" | "finished",
    stopReason?: SubagentLifecycleNotification["stopReason"],
  ): void {
    const parentSessionId = getParentSessionId(carrier);
    const childSessionId = getNonEmptyString(info.id);
    const runId = getNonEmptyString(info.runId);
    const provider = getNonEmptyString(info.provider);
    if (!parentSessionId || !childSessionId || !runId || !provider) return;
    const revision = this.revisions.get(parentSessionId) ?? 0;
    this.revisions.set(parentSessionId, revision + 1);
    this.dependencies.notify(YISHAN_NOTIFICATIONS.subagentLifecycle, {
      version: LIFECYCLE_VERSION,
      parentSessionId,
      incarnation: this.dependencies.incarnation,
      revision,
      event,
      runId,
      childSessionId,
      provider,
      local: info.local,
      ...(stopReason === undefined ? {} : { stopReason }),
    });
  }
}

function normalizeStopReason(stopReason: string): LifecycleStopReason {
  if (STOP_REASONS.has(stopReason as LifecycleStopReason)) {
    return stopReason as LifecycleStopReason;
  }
  return "error";
}

function getParentSessionId(carrier: Scoped<object>): string | undefined {
  const parent = carrierKeyOf(carrier);
  if (!isAgent(parent) || parent.id !== parent.session.id) return undefined;
  return getNonEmptyString(parent.session.id);
}

function isAgent(value: unknown): value is Agent {
  return value !== null && typeof value === "object" && "id" in value && "session" in value;
}

function getNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

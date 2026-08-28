import { Context } from "@deepseek-ai/cordis";
import { scopeTarget } from "@deepseek-ai/dsh-scope";
import { describe, expect, it, vi } from "vitest";

import { YISHAN_NOTIFICATIONS } from "./protocol";
import { installSubagentLifecycleNotifications } from "./subagentLifecycle";

const parent = { id: "parent-1", session: { id: "parent-1" } };

function installHarness() {
  const ctx = new Context();
  const notify = vi.fn();
  installSubagentLifecycleNotifications(ctx, { incarnation: "runtime-1", notify });
  return { ctx, notify };
}

function emitLifecycle(ctx: Context, name: "subagent/start" | "subagent/end", info: Record<string, unknown>): void {
  for (const callback of ctx.events.dispatch("emit", [scopeTarget(ctx, parent), name, info])) callback(info);
}

describe("subagent lifecycle notifications", () => {
  it("emits scoped parent start and finished payloads with synchronous revisions", () => {
    const { ctx, notify } = installHarness();
    emitLifecycle(ctx, "subagent/start", { runId: "run-1", id: "child-1", provider: "spawn", local: true });
    emitLifecycle(ctx, "subagent/end", {
      runId: "run-1",
      id: "child-1",
      provider: "spawn",
      local: true,
      stopReason: "completed",
    });

    expect(notify).toHaveBeenNthCalledWith(1, YISHAN_NOTIFICATIONS.subagentLifecycle, {
      version: 1,
      parentSessionId: "parent-1",
      incarnation: "runtime-1",
      revision: 0,
      event: "started",
      runId: "run-1",
      childSessionId: "child-1",
      provider: "spawn",
      local: true,
    });
    expect(notify).toHaveBeenNthCalledWith(2, YISHAN_NOTIFICATIONS.subagentLifecycle, {
      version: 1,
      parentSessionId: "parent-1",
      incarnation: "runtime-1",
      revision: 1,
      event: "finished",
      runId: "run-1",
      childSessionId: "child-1",
      provider: "spawn",
      local: true,
      stopReason: "completed",
    });
  });

  it("does not publish without a scoped parent or canonical child identity", () => {
    const { ctx, notify } = installHarness();
    ctx.emit("subagent/start", { runId: "run-1", id: "child-1", provider: "spawn", local: true } as never);
    emitLifecycle(ctx, "subagent/start", { runId: "run-1", id: "", provider: "spawn", local: true });
    expect(notify).not.toHaveBeenCalled();
  });

  it("maps unknown DSH stop reasons to an error terminal edge", () => {
    const { ctx, notify } = installHarness();
    emitLifecycle(ctx, "subagent/end", {
      runId: "run-1",
      id: "child-1",
      provider: "spawn",
      local: false,
      stopReason: "unrecognized",
    });
    expect(notify).toHaveBeenCalledWith(YISHAN_NOTIFICATIONS.subagentLifecycle, {
      version: 1,
      parentSessionId: "parent-1",
      incarnation: "runtime-1",
      revision: 0,
      event: "finished",
      runId: "run-1",
      childSessionId: "child-1",
      provider: "spawn",
      local: false,
      stopReason: "error",
    });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { type AgentTerminalEvent, emptyAgentUsageStats } from "../delegation/types";
import { CompletionOwner } from "./completionOwner";

function terminal(id = "one", origin?: "user" | "shutdown", error?: string): AgentTerminalEvent {
  const status = origin ? "cancelled" : error ? "failed" : "completed";
  return {
    parent: { sessionId: "A", lifetime: "first" },
    record: {
      id,
      agentName: "Explore",
      prompt: "task",
      mode: "background",
      status,
      createdAt: 0,
      usage: emptyAgentUsageStats,
    },
    result: {
      agentId: id,
      agentName: "Explore",
      status,
      responseText: "findings",
      error,
      cancellationOrigin: origin,
      usage: emptyAgentUsageStats,
    },
  };
}
function setup(send = vi.fn(), warn = vi.fn()) {
  const owner = new CompletionOwner({ sessionId: "A", lifetime: "first", send, warn });
  return { owner, send, warn };
}
afterEach(() => vi.useRealTimers());
describe("completion ownership", () => {
  it("delivers only enrolled matching terminals once, with custom followUp policy", () => {
    const { owner, send } = setup();
    owner.terminal(terminal());
    expect(send).not.toHaveBeenCalled();
    owner.enroll("one");
    owner.terminal({ ...terminal(), parent: { sessionId: "A", lifetime: "old" } });
    expect(send).not.toHaveBeenCalled();
    owner.terminal(terminal());
    owner.terminal(terminal());
    owner.enroll("one");
    owner.terminal(terminal());
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ customType: "subagent-completion", display: true }), {
      deliverAs: "followUp",
      triggerTurn: true,
    });
    for (const [id, origin] of [
      ["user", "user"],
      ["shutdown", "shutdown"],
    ] as const) {
      owner.enroll(id);
      owner.terminal(terminal(id, origin));
      expect(send).toHaveBeenLastCalledWith(expect.anything(), {
        deliverAs: "followUp",
        triggerTurn: origin !== "user",
      });
    }
  });
  it("claims before send and drains reentrant arrivals without replay", () => {
    const send = vi.fn(() => {
      owner.terminal(terminal());
      owner.enroll("one");
      owner.terminal(terminal());
      if (send.mock.calls.length === 1) owner.terminal(terminal("two"));
    });
    const { owner } = setup(send);
    owner.enroll("two");
    owner.enroll("one");
    owner.terminal(terminal());
    expect(send).toHaveBeenCalledTimes(2);
    owner.terminal(terminal("one"));
    owner.terminal(terminal("two"));
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("retries synchronous failure without another event and deduplicates accepted delivery", () => {
    vi.useFakeTimers();
    const send = vi.fn().mockImplementationOnce(() => {
      throw new Error("busy");
    });
    const { owner } = setup(send);
    owner.enroll("one");
    owner.terminal(terminal());
    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(99);
    expect(send).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(send).toHaveBeenCalledTimes(2);
    owner.enroll("one");
    owner.terminal(terminal());
    vi.runAllTimers();
    expect(send).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("concurrent duplicate terminals and enrollment cannot accelerate a scheduled retry", async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockImplementationOnce(() => {
      throw new Error("retry me");
    });
    const { owner } = setup(send);
    owner.enroll("one");
    owner.terminal(terminal());
    await Promise.all([
      Promise.resolve().then(() => owner.terminal(terminal())),
      Promise.resolve().then(() => {
        owner.enroll("one");
        owner.terminal(terminal());
      }),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    vi.runAllTimers();
    expect(send).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("exhausts 100/500/1500ms retries, warns for inspection, and never resets on duplicates", () => {
    vi.useFakeTimers();
    const send = vi.fn<() => void>(() => {
      throw new Error("unavailable");
    });
    const { owner, warn } = setup(send);
    owner.enroll("one");
    owner.terminal(terminal());
    for (const [index, delay] of [100, 500, 1500].entries()) {
      vi.advanceTimersByTime(delay - 1);
      expect(send).toHaveBeenCalledTimes(index + 1);
      vi.advanceTimersByTime(1);
      expect(send).toHaveBeenCalledTimes(index + 2);
    }
    expect(send).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("/agent-result one"));
    expect(warn).toHaveBeenCalledWith(expect.not.stringContaining("/agent-send"));
    send.mockImplementation(() => {});
    owner.enroll("one");
    owner.terminal(terminal());
    expect(send).toHaveBeenCalledTimes(4);
    owner.enroll("one");
    owner.terminal(terminal());
    vi.runAllTimers();
    expect(send).toHaveBeenCalledTimes(4);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("close clears timers and drops callbacks, including close during a throwing send", () => {
    vi.useFakeTimers();
    const send = vi.fn(() => {
      owner.close();
      throw new Error("closed");
    });
    const { owner } = setup(send);
    owner.enroll("one");
    owner.terminal(terminal());
    owner.enroll("two");
    owner.terminal(terminal("two"));
    owner.enroll("one");
    owner.terminal(terminal());
    vi.runAllTimers();
    expect(send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    const other = setup(
      vi.fn(() => {
        throw new Error("retry");
      }),
    );
    other.owner.enroll("one");
    other.owner.terminal(terminal());
    other.owner.close();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("isolates A -> B -> A lifetimes even when run ids repeat", () => {
    const old = setup();
    old.owner.enroll("one");
    old.owner.close();
    const b = new CompletionOwner({ sessionId: "B", lifetime: "second", send: vi.fn(), warn: vi.fn() });
    b.close();
    const send = vi.fn();
    const next = new CompletionOwner({ sessionId: "A", lifetime: "third", send, warn: vi.fn() });
    next.enroll("one");
    old.owner.terminal(terminal());
    next.terminal(terminal());
    expect(send).not.toHaveBeenCalled();
    expect(old.send).not.toHaveBeenCalled();
    next.terminal({ ...terminal(), parent: { sessionId: "A", lifetime: "third" } });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

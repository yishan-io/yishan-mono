import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetExplicitlyClosedTerminalTabIdsForTests,
  consumeExplicitlyClosedTerminalTabId,
  recordExplicitlyClosedTerminalTabId,
} from "./terminalCloseTombstones";

describe("terminalCloseTombstones (moves to terminal/runtime after P30)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetExplicitlyClosedTerminalTabIdsForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    __resetExplicitlyClosedTerminalTabIdsForTests();
  });

  it("returns true while the tombstone is fresh (consume is not one-shot; TTL expiry removes it)", () => {
    recordExplicitlyClosedTerminalTabId("tab-1");
    expect(consumeExplicitlyClosedTerminalTabId("tab-1")).toBe(true);
    expect(consumeExplicitlyClosedTerminalTabId("tab-1")).toBe(true);
  });

  it("ignores empty or whitespace tab ids", () => {
    recordExplicitlyClosedTerminalTabId("");
    recordExplicitlyClosedTerminalTabId("   ");
    expect(consumeExplicitlyClosedTerminalTabId("")).toBe(false);
  });

  it("expires tombstones after the TTL", () => {
    recordExplicitlyClosedTerminalTabId("tab-expiring");
    vi.advanceTimersByTime(5001);
    expect(consumeExplicitlyClosedTerminalTabId("tab-expiring")).toBe(false);
  });

  it("keeps a tombstone fresh inside the TTL", () => {
    recordExplicitlyClosedTerminalTabId("tab-fresh");
    vi.advanceTimersByTime(4999);
    expect(consumeExplicitlyClosedTerminalTabId("tab-fresh")).toBe(true);
  });

  it("returns false for unknown tab ids", () => {
    expect(consumeExplicitlyClosedTerminalTabId("never-recorded")).toBe(false);
  });
});

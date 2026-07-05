import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();
vi.mock("node:child_process", () => ({ spawn: spawnMock }));

describe("createPiNotifyExtension", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalPlatform: string;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalPlatform = process.platform;

    vi.resetModules();
    spawnMock.mockClear();
    vi.useFakeTimers();

    spawnMock.mockReturnValue({
      on: vi.fn(),
      unref: vi.fn(),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    Object.defineProperty(process, "platform", {
      value: originalPlatform,
      configurable: true,
    });
    vi.useRealTimers();
  });

  async function loadExtension() {
    return await import("../src/extension");
  }

  function getHandler(calls: unknown[][], eventName: string): ((...args: unknown[]) => void) | undefined {
    const match = calls.find((call) => call[0] === eventName);
    return match?.[1] as ((...args: unknown[]) => void) | undefined;
  }

  function mockPi(): { on: ReturnType<typeof vi.fn>; api: ExtensionAPI } {
    const on = vi.fn();
    return { on, api: { on } as unknown as ExtensionAPI };
  }

  it("exits early when YISHAN_NOTIFY_SCRIPT_PATH is not set", async () => {
    // biome-ignore lint/performance/noDelete: process.env requires delete, undefined sets string "undefined"
    delete process.env.YISHAN_NOTIFY_SCRIPT_PATH;

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    expect(on).not.toHaveBeenCalled();
  });

  it("exits early when no managed terminal env vars are set", async () => {
    process.env.YISHAN_NOTIFY_SCRIPT_PATH = "/tmp/notify.sh";
    // biome-ignore lint/performance/noDelete: process.env requires delete, undefined sets string "undefined"
    delete process.env.YISHAN_TERMINAL_ID;
    // biome-ignore lint/performance/noDelete: process.env requires delete, undefined sets string "undefined"
    delete process.env.YISHAN_TAB_ID;
    // biome-ignore lint/performance/noDelete: process.env requires delete, undefined sets string "undefined"
    delete process.env.YISHAN_PANE_ID;

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    expect(on).not.toHaveBeenCalled();
  });

  it("registers lifecycle handlers when managed terminal env vars are set", async () => {
    process.env.YISHAN_NOTIFY_SCRIPT_PATH = "/tmp/notify.sh";
    process.env.YISHAN_TERMINAL_ID = "term-1";

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    expect(on).toHaveBeenCalledTimes(4);
    expect(on).toHaveBeenCalledWith("before_agent_start", expect.any(Function));
    expect(on).toHaveBeenCalledWith("tool_execution_end", expect.any(Function));
    expect(on).toHaveBeenCalledWith("agent_end", expect.any(Function));
    expect(on).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
  });

  it("fires Start on first before_agent_start", async () => {
    process.env.YISHAN_NOTIFY_SCRIPT_PATH = "/tmp/notify.sh";
    process.env.YISHAN_TAB_ID = "tab-1";

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    const handler = getHandler(on.mock.calls, "before_agent_start");
    expect(handler).toBeDefined();
    handler?.(null, { hasUI: true });

    expect(spawnMock).toHaveBeenCalledWith("bash", expect.arrayContaining(["Start"]), expect.any(Object));
  });

  it("debounces Stop: cancels pending Stop when new turn starts", async () => {
    process.env.YISHAN_NOTIFY_SCRIPT_PATH = "/tmp/notify.sh";
    process.env.YISHAN_TAB_ID = "tab-1";

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    const startHandler = getHandler(on.mock.calls, "before_agent_start");
    const stopHandler = getHandler(on.mock.calls, "agent_end");
    expect(startHandler).toBeDefined();
    expect(stopHandler).toBeDefined();

    // First turn: start → busy
    startHandler?.(null, { hasUI: true });
    expect(spawnMock).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(["Start"]), expect.any(Object));
    spawnMock.mockClear();

    // End turn: schedules debounced Stop (not fired yet)
    stopHandler?.(null, { hasUI: true });
    expect(spawnMock).not.toHaveBeenCalled();

    // Next turn starts within debounce window: cancels pending Stop,
    // fires new Start (daemon sees Start→Start without intervening Stop)
    startHandler?.(null, { hasUI: true });
    expect(spawnMock).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(["Start"]), expect.any(Object));
    spawnMock.mockClear();

    // Fast-forward past debounce (timer was cancelled, so no Stop fires)
    vi.advanceTimersByTime(3000);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("fires Stop after debounce when no new turn starts", async () => {
    process.env.YISHAN_NOTIFY_SCRIPT_PATH = "/tmp/notify.sh";
    process.env.YISHAN_TAB_ID = "tab-1";

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    const startHandler = getHandler(on.mock.calls, "before_agent_start");
    const stopHandler = getHandler(on.mock.calls, "agent_end");
    expect(startHandler).toBeDefined();
    expect(stopHandler).toBeDefined();

    // Start → busy
    startHandler?.(null, { hasUI: true });
    spawnMock.mockClear();

    // End turn: schedules debounced Stop
    stopHandler?.(null, { hasUI: true });
    expect(spawnMock).not.toHaveBeenCalled();

    // Fast-forward past debounce: Stop fires
    vi.advanceTimersByTime(3000);
    expect(spawnMock).toHaveBeenCalledWith("bash", expect.arrayContaining(["Stop"]), expect.any(Object));
  });

  it("session_shutdown fires immediate Stop, cancels pending debounce", async () => {
    process.env.YISHAN_NOTIFY_SCRIPT_PATH = "/tmp/notify.sh";
    process.env.YISHAN_TAB_ID = "tab-1";

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    const startHandler = getHandler(on.mock.calls, "before_agent_start");
    const stopHandler = getHandler(on.mock.calls, "agent_end");
    const shutdownHandler = getHandler(on.mock.calls, "session_shutdown");
    expect(startHandler).toBeDefined();
    expect(stopHandler).toBeDefined();
    expect(shutdownHandler).toBeDefined();

    // Start → busy
    startHandler?.(null, { hasUI: true });
    spawnMock.mockClear();

    // End turn: schedules debounced Stop
    stopHandler?.(null, { hasUI: true });
    expect(spawnMock).not.toHaveBeenCalled();

    // Session shutdown: immediate Stop, cancels timer
    shutdownHandler?.(null, { hasUI: true });
    expect(spawnMock).toHaveBeenCalledWith("bash", expect.arrayContaining(["Stop"]), expect.any(Object));

    // Fast-forward — timer was cancelled, no duplicate
    spawnMock.mockClear();
    vi.advanceTimersByTime(3000);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("fires PostToolUse on tool_execution_end", async () => {
    process.env.YISHAN_NOTIFY_SCRIPT_PATH = "/tmp/notify.sh";
    process.env.YISHAN_TERMINAL_ID = "term-1";

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    const handler = getHandler(on.mock.calls, "tool_execution_end");
    expect(handler).toBeDefined();

    handler?.(null, { hasUI: true });
    expect(spawnMock).toHaveBeenCalledWith("bash", expect.arrayContaining(["PostToolUse"]), expect.any(Object));
  });

  it("skips notification when ctx.hasUI is false", async () => {
    process.env.YISHAN_NOTIFY_SCRIPT_PATH = "/tmp/notify.sh";
    process.env.YISHAN_TAB_ID = "tab-1";

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    const handler = getHandler(on.mock.calls, "before_agent_start");
    expect(handler).toBeDefined();

    handler?.(null, { hasUI: false });
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

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
    expect(on).toHaveBeenCalledWith("agent_start", expect.any(Function));
    expect(on).toHaveBeenCalledWith("tool_execution_end", expect.any(Function));
    expect(on).toHaveBeenCalledWith("agent_settled", expect.any(Function));
    expect(on).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
  });

  it("fires Start on first agent_start", async () => {
    process.env.YISHAN_NOTIFY_SCRIPT_PATH = "/tmp/notify.sh";
    process.env.YISHAN_TAB_ID = "tab-1";

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    const handler = getHandler(on.mock.calls, "agent_start");
    expect(handler).toBeDefined();
    handler?.(null, { hasUI: true });

    expect(spawnMock).toHaveBeenCalledWith("bash", expect.arrayContaining(["Start"]), expect.any(Object));
  });

  it("does not emit duplicate Start while already busy", async () => {
    process.env.YISHAN_NOTIFY_SCRIPT_PATH = "/tmp/notify.sh";
    process.env.YISHAN_TAB_ID = "tab-1";

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    const startHandler = getHandler(on.mock.calls, "agent_start");
    expect(startHandler).toBeDefined();

    startHandler?.(null, { hasUI: true });
    expect(spawnMock).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining(["Start"]), expect.any(Object));
    spawnMock.mockClear();

    startHandler?.(null, { hasUI: true });
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("fires Stop on agent_settled", async () => {
    process.env.YISHAN_NOTIFY_SCRIPT_PATH = "/tmp/notify.sh";
    process.env.YISHAN_TAB_ID = "tab-1";

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    const startHandler = getHandler(on.mock.calls, "agent_start");
    const settledHandler = getHandler(on.mock.calls, "agent_settled");
    expect(startHandler).toBeDefined();
    expect(settledHandler).toBeDefined();

    startHandler?.(null, { hasUI: true });
    spawnMock.mockClear();

    settledHandler?.(null, { hasUI: true });
    expect(spawnMock).toHaveBeenCalledWith("bash", expect.arrayContaining(["Stop"]), expect.any(Object));
  });

  it("session_shutdown fires immediate Stop when still busy", async () => {
    process.env.YISHAN_NOTIFY_SCRIPT_PATH = "/tmp/notify.sh";
    process.env.YISHAN_TAB_ID = "tab-1";

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    const startHandler = getHandler(on.mock.calls, "agent_start");
    const shutdownHandler = getHandler(on.mock.calls, "session_shutdown");
    expect(startHandler).toBeDefined();
    expect(shutdownHandler).toBeDefined();

    startHandler?.(null, { hasUI: true });
    spawnMock.mockClear();

    shutdownHandler?.(null, { hasUI: true });
    expect(spawnMock).toHaveBeenCalledWith("bash", expect.arrayContaining(["Stop"]), expect.any(Object));
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

    const handler = getHandler(on.mock.calls, "agent_start");
    expect(handler).toBeDefined();

    handler?.(null, { hasUI: false });
    expect(spawnMock).not.toHaveBeenCalled();
  });
});

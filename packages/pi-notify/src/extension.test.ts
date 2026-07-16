import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("createPiNotifyExtension", () => {
  let originalEnv: NodeJS.ProcessEnv;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalEnv = { ...process.env };

    vi.resetModules();

    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
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

  it("exits early when YISHAN_HOOK_INGRESS_URL is not set", async () => {
    // biome-ignore lint/performance/noDelete: process.env requires delete, undefined sets string "undefined"
    delete process.env.YISHAN_HOOK_INGRESS_URL;

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    expect(on).not.toHaveBeenCalled();
  });

  it("exits early when no managed terminal env vars are set", async () => {
    process.env.YISHAN_HOOK_INGRESS_URL = "http://127.0.0.1:12345/v1/agent-hook/ingest";
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

  it("registers lifecycle handlers when managed terminal env vars and hook ingress URL are set", async () => {
    process.env.YISHAN_HOOK_INGRESS_URL = "http://127.0.0.1:12345/v1/agent-hook/ingest";
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

  it("fires Start on first agent_start via HTTP", async () => {
    process.env.YISHAN_HOOK_INGRESS_URL = "http://127.0.0.1:12345/v1/agent-hook/ingest";
    process.env.YISHAN_WORKSPACE_ID = "ws-1";
    process.env.YISHAN_TAB_ID = "tab-1";
    process.env.YISHAN_PANE_ID = "pane-1";

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    const handler = getHandler(on.mock.calls, "agent_start");
    expect(handler).toBeDefined();
    handler?.(null, { hasUI: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const startCall = fetchMock.mock.calls[0] as unknown[] | undefined;
    expect(startCall).toBeDefined();
    const url = (startCall as unknown[])[0];
    const options = (startCall as unknown[])[1] as Record<string, unknown>;
    expect(url).toBe("http://127.0.0.1:12345/v1/agent-hook/ingest");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({ "content-type": "application/json" });

    const body = JSON.parse(options.body as string);
    expect(body.agent).toBe("pi");
    expect(body.rawEventType).toBe("Start");
    expect(body.workspaceId).toBe("ws-1");
    expect(body.tabId).toBe("tab-1");
    expect(body.paneId).toBe("pane-1");
    expect(body.payload).toEqual({});
    expect(body.ts).toEqual(expect.any(Number));
  });

  it("does not emit duplicate Start while already busy", async () => {
    process.env.YISHAN_HOOK_INGRESS_URL = "http://127.0.0.1:12345/v1/agent-hook/ingest";
    process.env.YISHAN_TAB_ID = "tab-1";

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    const startHandler = getHandler(on.mock.calls, "agent_start");
    expect(startHandler).toBeDefined();

    startHandler?.(null, { hasUI: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();

    startHandler?.(null, { hasUI: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fires Stop on agent_settled via HTTP", async () => {
    process.env.YISHAN_HOOK_INGRESS_URL = "http://127.0.0.1:12345/v1/agent-hook/ingest";
    process.env.YISHAN_TAB_ID = "tab-1";

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    const startHandler = getHandler(on.mock.calls, "agent_start");
    const settledHandler = getHandler(on.mock.calls, "agent_settled");
    expect(startHandler).toBeDefined();
    expect(settledHandler).toBeDefined();

    startHandler?.(null, { hasUI: true });
    fetchMock.mockClear();

    settledHandler?.(null, { hasUI: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const settledCall = fetchMock.mock.calls[0] as unknown[] | undefined;
    expect(settledCall).toBeDefined();
    const settledOptions = (settledCall as unknown[])[1] as Record<string, string>;
    expect(JSON.parse(settledOptions.body as string).rawEventType).toBe("Stop");
  });

  it("session_shutdown fires immediate Stop via HTTP when still busy", async () => {
    process.env.YISHAN_HOOK_INGRESS_URL = "http://127.0.0.1:12345/v1/agent-hook/ingest";
    process.env.YISHAN_TAB_ID = "tab-1";

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    const startHandler = getHandler(on.mock.calls, "agent_start");
    const shutdownHandler = getHandler(on.mock.calls, "session_shutdown");
    expect(startHandler).toBeDefined();
    expect(shutdownHandler).toBeDefined();

    startHandler?.(null, { hasUI: true });
    fetchMock.mockClear();

    shutdownHandler?.(null, { hasUI: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const shutdownCall = fetchMock.mock.calls[0] as unknown[] | undefined;
    expect(shutdownCall).toBeDefined();
    const shutdownOptions = (shutdownCall as unknown[])[1] as Record<string, string>;
    expect(JSON.parse(shutdownOptions.body as string).rawEventType).toBe("Stop");
  });

  it("fires PostToolUse on tool_execution_end via HTTP", async () => {
    process.env.YISHAN_HOOK_INGRESS_URL = "http://127.0.0.1:12345/v1/agent-hook/ingest";
    process.env.YISHAN_TAB_ID = "tab-1";

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    const handler = getHandler(on.mock.calls, "tool_execution_end");
    expect(handler).toBeDefined();

    handler?.(null, { hasUI: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const toolCall = fetchMock.mock.calls[0] as unknown[] | undefined;
    expect(toolCall).toBeDefined();
    const toolOptions = (toolCall as unknown[])[1] as Record<string, string>;
    expect(JSON.parse(toolOptions.body as string).rawEventType).toBe("PostToolUse");
  });

  it("skips notification when ctx.hasUI is false", async () => {
    process.env.YISHAN_HOOK_INGRESS_URL = "http://127.0.0.1:12345/v1/agent-hook/ingest";
    process.env.YISHAN_TAB_ID = "tab-1";

    const { createPiNotifyExtension } = await loadExtension();
    const { on, api } = mockPi();
    createPiNotifyExtension(api);

    const handler = getHandler(on.mock.calls, "agent_start");
    expect(handler).toBeDefined();

    handler?.(null, { hasUI: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

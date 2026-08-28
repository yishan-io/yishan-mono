import { describe, expect, it, vi } from "vitest";

import {
  YISHAN_REQUEST_POLICY_DENIAL_MESSAGE,
  type YishanRequestPolicyError,
  createRequestRouter,
} from "./requestRouter";

describe("createRequestRouter", () => {
  it("routes yishan methods to the extension handler", async () => {
    const stock = vi.fn();
    const extension = vi.fn().mockResolvedValue({ cancelled: true });
    const route = createRequestRouter(stock, extension);

    await expect(route("yishan.v1.session.cancel", { sessionId: "session-1" })).resolves.toEqual({ cancelled: true });
    expect(extension).toHaveBeenCalledOnce();
    expect(stock).not.toHaveBeenCalled();
  });

  it("rejects unsupported Yishan protocol versions separately from policy denials", async () => {
    const route = createRequestRouter(vi.fn(), vi.fn());
    await expect(route("yishan.v2.session.cancel", {})).rejects.toMatchObject({
      code: "YISHAN_UNSUPPORTED_METHOD",
      message: "unsupported Yishan protocol method: yishan.v2.session.cancel",
    });
  });

  it("rejects stock session creation with a typed policy denial", async () => {
    const stock = vi.fn();
    const route = createRequestRouter(stock, vi.fn());

    await expect(route("session/new", {})).rejects.toMatchObject({
      name: "YishanRequestPolicyError",
      code: "YISHAN_STOCK_SESSION_EXECUTION_DENIED",
    } satisfies Partial<YishanRequestPolicyError>);
    expect(stock).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", {}],
    ["null", { sessionId: null }],
    ["numeric", { sessionId: 1 }],
    ["empty", { sessionId: "" }],
  ])("rejects stock prompts with a %s sessionId even when the owner would approve it", async (_case, params) => {
    const stock = vi.fn();
    const ownsSession = vi.fn(() => true);
    const route = createRequestRouter(stock, vi.fn(), ownsSession);

    await expect(route("session/prompt", params)).rejects.toMatchObject({
      name: "YishanRequestPolicyError",
      code: "YISHAN_STOCK_SESSION_EXECUTION_DENIED",
      message: `${YISHAN_REQUEST_POLICY_DENIAL_MESSAGE}: stock DSH session execution is denied by Yishan policy: session/prompt`,
    } satisfies Partial<YishanRequestPolicyError>);
    expect(ownsSession).not.toHaveBeenCalled();
    expect(stock).not.toHaveBeenCalled();
  });

  it("rejects stock prompts for sessions not owned by Yishan", async () => {
    const stock = vi.fn();
    const route = createRequestRouter(stock, vi.fn(), () => false);

    await expect(route("session/prompt", { sessionId: "stock-session", contentBlocks: [] })).rejects.toMatchObject({
      name: "YishanRequestPolicyError",
      code: "YISHAN_STOCK_SESSION_EXECUTION_DENIED",
    } satisfies Partial<YishanRequestPolicyError>);
    expect(stock).not.toHaveBeenCalled();
  });

  it("delegates stock prompts for sessions owned by Yishan", async () => {
    const stock = vi.fn().mockResolvedValue({ messageId: "message-1" });
    const extension = vi.fn();
    const route = createRequestRouter(stock, extension, (sessionId) => sessionId === "session-1");

    await expect(route("session/prompt", { sessionId: "session-1" })).resolves.toEqual({ messageId: "message-1" });
    expect(stock).toHaveBeenCalledOnce();
    expect(extension).not.toHaveBeenCalled();
  });

  it("delegates stock initialization and shutdown unchanged", async () => {
    const stock = vi.fn().mockResolvedValue({});
    const route = createRequestRouter(stock, vi.fn());

    await expect(route("initialize", {})).resolves.toEqual({});
    await expect(route("shutdown", {})).resolves.toEqual({});
    expect(stock).toHaveBeenCalledTimes(2);
  });
});

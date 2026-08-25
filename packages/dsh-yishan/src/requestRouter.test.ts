import { describe, expect, it, vi } from "vitest";

import { createRequestRouter } from "./requestRouter";

describe("createRequestRouter", () => {
  it("routes yishan methods to the extension handler", async () => {
    const stock = vi.fn();
    const extension = vi.fn().mockResolvedValue({ cancelled: true });
    const route = createRequestRouter(stock, extension);

    await expect(route("yishan.v1.session.cancel", { sessionId: "session-1" })).resolves.toEqual({ cancelled: true });
    expect(extension).toHaveBeenCalledOnce();
    expect(stock).not.toHaveBeenCalled();
  });

  it("rejects unsupported Yishan protocol versions", async () => {
    const route = createRequestRouter(vi.fn(), vi.fn());
    await expect(route("yishan.v2.session.cancel", {})).rejects.toThrow("unsupported Yishan protocol method");
  });

  it("delegates stock SDK methods unchanged", async () => {
    const stock = vi.fn().mockResolvedValue({ messageId: "message-1" });
    const extension = vi.fn();
    const route = createRequestRouter(stock, extension);

    await expect(route("session/prompt", { sessionId: "session-1" })).resolves.toEqual({ messageId: "message-1" });
    expect(stock).toHaveBeenCalledOnce();
    expect(extension).not.toHaveBeenCalled();
  });
});

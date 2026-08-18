// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { appendBrowserHistory, loadBrowserHistory, openExternalUrl } from "./browserHostCommands";

const mocks = vi.hoisted(() => ({
  openExternalUrl: vi.fn(),
  loadBrowserHistory: vi.fn(),
  appendBrowserHistory: vi.fn(),
}));

vi.mock("../../../rpc/rpcTransport", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../rpc/rpcTransport")>();
  return {
    ...actual,
    getDesktopHostBridge: vi.fn(() => ({
      openExternalUrl: mocks.openExternalUrl,
      loadBrowserHistory: mocks.loadBrowserHistory,
      appendBrowserHistory: mocks.appendBrowserHistory,
    })),
  };
});

describe("browserHostCommands", () => {
  it("opens an external URL through the host bridge", async () => {
    mocks.openExternalUrl.mockResolvedValueOnce({ opened: true });
    const result = await openExternalUrl("https://yishan.io/docs");

    expect(mocks.openExternalUrl).toHaveBeenCalledWith({ url: "https://yishan.io/docs" });
    expect(result).toEqual({ opened: true });
  });

  it("loads browser history groups from the host bridge", async () => {
    const historyGroups = [{ host: "yishan.io", entries: [] }];
    mocks.loadBrowserHistory.mockResolvedValueOnce(historyGroups);

    const result = await loadBrowserHistory();

    expect(mocks.loadBrowserHistory).toHaveBeenCalledWith();
    expect(result).toBe(historyGroups);
  });

  it("appends one browser history entry through the host bridge", async () => {
    mocks.appendBrowserHistory.mockResolvedValueOnce({ ok: true });
    const entry = { url: "https://yishan.io", title: "Yishan", visitedAt: "2026-08-18T00:00:00.000Z" };

    const result = await appendBrowserHistory({ entry });

    expect(mocks.appendBrowserHistory).toHaveBeenCalledWith({ entry });
    expect(result).toEqual({ ok: true });
  });
});

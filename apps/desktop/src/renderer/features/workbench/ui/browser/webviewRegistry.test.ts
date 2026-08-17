// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { getOrCreateWebview, removeWebviewsForClosedTabs, syncWebviewUrl } from "./webviewRegistry";

describe("webviewRegistry", () => {
  afterEach(() => {
    removeWebviewsForClosedTabs(new Set());
  });

  it("reuses the same webview for the same tab", () => {
    const first = getOrCreateWebview("tab-1", "https://example.com");
    const second = getOrCreateWebview("tab-1", "https://other.example");

    expect(second).toBe(first);
    expect(first.getAttribute("src")).toBe("https://example.com");
  });

  it("removes webviews for closed tabs", () => {
    const open = getOrCreateWebview("tab-open", "https://example.com");
    const closed = getOrCreateWebview("tab-closed", "https://example.org");
    document.body.append(open, closed);

    removeWebviewsForClosedTabs(new Set(["tab-open"]));

    expect(document.body.contains(open)).toBe(true);
    expect(document.body.contains(closed)).toBe(false);
  });

  it("forces a navigation when requested URL matches stale pending request", () => {
    const webview = getOrCreateWebview("tab-1", "https://example.com");
    const setAttributeSpy = vi.spyOn(webview, "setAttribute");
    Object.defineProperty(webview, "getURL", {
      configurable: true,
      value: vi.fn(() => "about:blank"),
    });

    syncWebviewUrl("tab-1", "https://example.com");

    expect(setAttributeSpy).toHaveBeenCalledWith("src", "https://example.com");
  });

  it("does not throw when getURL is unavailable before dom-ready", () => {
    const webview = getOrCreateWebview("tab-2", "https://example.com");
    Object.defineProperty(webview, "getURL", {
      configurable: true,
      value: vi.fn(() => {
        throw new Error("not ready");
      }),
    });

    expect(() => syncWebviewUrl("tab-2", "https://example.com")).not.toThrow();
  });
});

import { createFixedRuntimeLayer } from "../runtime/runtimeSurfaceLayer";

const webviewsByTabId = new Map<string, Electron.WebviewTag>();
const requestedUrlByTabId = new Map<string, string>();
const runtimeLayer = createFixedRuntimeLayer("webview-root-host");

export function getOrCreateWebview(tabId: string, initialUrl: string): Electron.WebviewTag {
  const existing = webviewsByTabId.get(tabId);
  if (existing) {
    if (!requestedUrlByTabId.has(tabId)) {
      requestedUrlByTabId.set(tabId, existing.getAttribute("src") ?? "");
    }
    return existing;
  }

  const webview = document.createElement("webview") as Electron.WebviewTag;
  webview.style.position = "fixed";
  webview.style.left = "0";
  webview.style.top = "0";
  webview.style.width = "0";
  webview.style.height = "0";
  webview.style.margin = "0";
  webview.style.padding = "0";
  webview.style.border = "none";
  webview.style.visibility = "hidden";
  webview.style.pointerEvents = "auto";
  if (initialUrl) {
    webview.setAttribute("src", initialUrl);
  }
  runtimeLayer.register(tabId, webview as unknown as HTMLElement);
  webviewsByTabId.set(tabId, webview);
  requestedUrlByTabId.set(tabId, initialUrl);
  return webview;
}

export function syncWebviewUrl(tabId: string, resolvedUrl: string): void {
  const webview = webviewsByTabId.get(tabId);
  if (!webview) {
    return;
  }

  const normalizedUrl = resolvedUrl.trim();
  const requestedUrl = requestedUrlByTabId.get(tabId) ?? "";
  const srcUrl = (webview.getAttribute("src") ?? "").trim();
  const currentUrl = (() => {
    try {
      return (webview.getURL?.() ?? "").trim() || srcUrl;
    } catch {
      return srcUrl;
    }
  })();
  if (requestedUrl === normalizedUrl && currentUrl === normalizedUrl) {
    return;
  }

  requestedUrlByTabId.set(tabId, normalizedUrl);
  webview.setAttribute("src", normalizedUrl);
}

export function parkWebview(tabId: string): void {
  const webview = webviewsByTabId.get(tabId);
  if (!webview) {
    return;
  }
  webview.style.visibility = "hidden";
  webview.style.left = "-10000px";
  webview.style.top = "-10000px";
  webview.style.width = "0";
  webview.style.height = "0";
  webview.style.pointerEvents = "none";
}

export function attachWebviewPlaceholder(tabId: string, placeholder: HTMLElement): void {
  const webview = webviewsByTabId.get(tabId);
  if (!webview) {
    return;
  }
  runtimeLayer.attach(tabId, placeholder);
  webview.style.left = "0";
  webview.style.top = "0";
}

export function detachWebviewPlaceholder(tabId: string, placeholder: HTMLElement): void {
  runtimeLayer.detach(tabId, placeholder);
  parkWebview(tabId);
}

export function removeWebviewsForClosedTabs(openTabIds: ReadonlySet<string>): void {
  for (const tabId of webviewsByTabId.keys()) {
    if (openTabIds.has(tabId)) {
      continue;
    }
    webviewsByTabId.delete(tabId);
    requestedUrlByTabId.delete(tabId);
    runtimeLayer.remove(tabId);
  }
}

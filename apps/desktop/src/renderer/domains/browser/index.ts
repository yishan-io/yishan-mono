/**
 * Browser Domain public API (Domains plan amendment, D7 work).
 *
 * Owns the webview browsing surface: browser tabs' content (BrowserView,
 * UrlBar, webview lifecycle), URL rules, browser history, and the Electron
 * host interactions behind them. Workbench owns the tab shell; App composes
 * BrowserView as one tab-kind content renderer. Other Domains use browser
 * through this file only.
 */
export { BrowserView } from "./features/browse/BrowserView";
export { reloadWebview, removeWebviewsForClosedTabs, syncWebviewUrl } from "./runtime/webviewRegistry";
export {
  appendBrowserHistory,
  loadBrowserHistory,
  openExternalUrl,
} from "./host/browserHostCommands";
export type { AppendBrowserHistoryInput, BrowserHistoryGroup } from "./host/browserHostCommands";
export { openLink, type OpenLinkOptions, type OpenLinkResult } from "./commands/browserLinkCommands";

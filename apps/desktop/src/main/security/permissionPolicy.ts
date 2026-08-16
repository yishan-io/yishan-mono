import type { Session } from "electron";

const ALLOWED_PERMISSIONS = new Set(["media", "clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);

/** Returns true when the permission is in the host allowlist. */
export function isPermissionAllowed(permission: string): boolean {
  return ALLOWED_PERMISSIONS.has(permission);
}

/**
 * Creates one host security owner for Chromium permission requests.
 *
 * Media stays available to all webContents (unchanged behavior); the clipboard
 * grants are scoped to the main window only so arbitrary BrowserView <webview>
 * content never gets them.
 */
export function registerPermissionPolicy(session: Session, isMainWindowWebContents: (id: number) => boolean): void {
  session.setPermissionRequestHandler((_webContents, permission, callback) => {
    const isMainWindow = isMainWindowWebContents(_webContents?.id ?? -1);
    callback(isPermissionAllowed(permission) && (permission === "media" || isMainWindow));
  });

  session.setPermissionCheckHandler((_webContents, permission) => {
    const isMainWindow = isMainWindowWebContents(_webContents?.id ?? -1);
    return isPermissionAllowed(permission) && (permission === "media" || isMainWindow);
  });
}

import { openExternalUrl } from "@renderer/domains/browser";
import { displaySettingsStore } from "@renderer/domains/settings";
import { openTab, workbenchNavigationStore } from "@renderer/domains/workbench";

/**
 * Browser link commands — open a URL per the user's link-target preference
 * (built-in browser tab or external OS browser).
 *
 * Owned by the Browser Domain (Domains plan D9): the browser surface decides
 * how a link opens. Previously an App command; Domain UI (files/agent/git/
 * terminal) opens links through this public API instead of importing app.
 */
export type OpenLinkResult =
  | {
      opened: true;
    }
  | {
      opened: false;
      reason: string;
    };

export type OpenLinkOptions = {
  url: string;
  workspaceId?: string;
};

function isHttpUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function resolveActiveWorkspaceId(): string | undefined {
  return workbenchNavigationStore.getState().activeWorkspaceId || undefined;
}

/** Opens one link in a built-in browser tab (when configured) or the OS browser. */
export async function openLink(options: OpenLinkOptions): Promise<OpenLinkResult> {
  const { url, workspaceId } = options;
  const linkTarget = displaySettingsStore.getState().linkTarget;

  if (linkTarget === "built-in" && isHttpUrl(url)) {
    const resolvedWorkspaceId = workspaceId ?? resolveActiveWorkspaceId();
    if (resolvedWorkspaceId) {
      openTab({ kind: "browser", workspaceId: resolvedWorkspaceId, url });
      return { opened: true };
    }
  }

  try {
    const result = await openExternalUrl(url);
    if (result.opened) {
      return { opened: true };
    }
    return { opened: false, reason: result.reason };
  } catch {
    return { opened: false, reason: "open-failed" };
  }
}

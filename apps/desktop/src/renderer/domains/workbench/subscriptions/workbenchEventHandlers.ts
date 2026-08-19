/**
 * Workbench event handlers — owns open.browser.url (opens a browser tab).
 *
 * The backend-event subscription is App-composed: app/events/index.ts passes
 * the router subscription into createWorkbenchEventHandlers so Workbench never
 * imports app (Domains plan D7).
 */
import { tabStore } from "../../../domains/workbench/state/tabStore";

export type WorkbenchEventDependencies = {
  subscribeOpenBrowserUrl?: (listener: (payload: { url: string; workspaceId: string }) => void) => () => void;
};

export const DEFAULT_WORKBENCH_EVENT_DEPENDENCIES: WorkbenchEventDependencies = {};

/**
 * Creates one workbench event handler factory. Returns `start()` which
 * subscribes to open.browser.url and returns a teardown.
 */
export function createWorkbenchEventHandlers(dependencies: WorkbenchEventDependencies) {
  const resolvedDependencies = {
    ...DEFAULT_WORKBENCH_EVENT_DEPENDENCIES,
    ...dependencies,
  } satisfies WorkbenchEventDependencies;
  return function startWorkbenchEventHandlers() {
    const unsubscribeOpenBrowserUrl =
      resolvedDependencies.subscribeOpenBrowserUrl?.((payload) => {
        tabStore
          .getState()
          .openTab(
            { kind: "browser", workspaceId: payload.workspaceId, url: payload.url },
            { workspaceId: payload.workspaceId },
          );
      }) ?? (() => {});

    return () => {
      unsubscribeOpenBrowserUrl();
    };
  };
}

/**
 * Workbench event handlers — owns open.browser.url (opens a browser tab).
 *
 * Phase 2 split from `backendEventStoreBindings.ts`. During the transition
 * this factory is consumed by the binding (no self-subscription); at Task 6 its
 * default deps subscribe via the router selectors.
 */
import { subscribeBackendEvent } from "../../../app/events/backendEventRouter";
import { tabStore } from "../../../store/tabStore";

export type WorkbenchEventDependencies = {
  subscribeOpenBrowserUrl?: (listener: (payload: { url: string; workspaceId: string }) => void) => () => void;
};

export const DEFAULT_WORKBENCH_EVENT_DEPENDENCIES: WorkbenchEventDependencies = {
  subscribeOpenBrowserUrl: (listener) =>
    subscribeBackendEvent("open.browser.url", (event) => {
      if (event.source !== "openBrowserUrl") {
        return;
      }
      listener(event.payload);
    }),
};

/**
 * Starts workbench event handlers with default deps.
 */
export function startWorkbenchEventHandlers() {
  return createWorkbenchEventHandlers(DEFAULT_WORKBENCH_EVENT_DEPENDENCIES)();
}

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
        tabStore.getState().openTab({ kind: "browser", workspaceId: payload.workspaceId, url: payload.url });
      }) ?? (() => {});

    return () => {
      unsubscribeOpenBrowserUrl();
    };
  };
}

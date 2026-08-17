import { useEffect, useRef } from "react";
import {
  createOpenTabAutoRefreshRuntime,
  type OpenTabAutoRefreshCommands,
  type OpenTabAutoRefreshContext,
  type RefreshableOpenTab,
  type SubscribeDaemonConnectionStatus,
} from "../../runtime/openTabAutoRefreshRuntime";

export type { RefreshableOpenTab } from "../../runtime/openTabAutoRefreshRuntime";

type UseOpenTabAutoRefreshInput = {
  workspaceId?: string;
  tabs: RefreshableOpenTab[];
  commands: OpenTabAutoRefreshCommands;
  subscribeDaemonConnectionStatus?: SubscribeDaemonConnectionStatus;
};

/**
 * Keeps open file and diff tabs synced with backend file and git change
 * events (Phase 13, desktop5.md). The request queue, subscriptions, and
 * eager-refresh logic live in the Workbench runtime
 * (`openTabAutoRefreshRuntime.ts`); this hook only attaches the latest tabs/
 * commands context and drives the runtime lifecycle.
 */
export function useOpenTabAutoRefresh(input: UseOpenTabAutoRefreshInput) {
  const runtimeRef = useRef<ReturnType<typeof createOpenTabAutoRefreshRuntime> | null>(null);
  if (runtimeRef.current === null) {
    runtimeRef.current = createOpenTabAutoRefreshRuntime();
  }
  const runtime = runtimeRef.current;

  const contextRef = useRef<OpenTabAutoRefreshContext>({ tabs: input.tabs, commands: input.commands });
  contextRef.current = { workspaceId: input.workspaceId, tabs: input.tabs, commands: input.commands };

  const { workspaceId } = input;

  useEffect(() => {
    if (!workspaceId) {
      return;
    }

    return runtime.start({
      workspaceId,
      getContext: () => contextRef.current,
      subscribeDaemonConnectionStatus: input.subscribeDaemonConnectionStatus,
    });
  }, [input.subscribeDaemonConnectionStatus, runtime, workspaceId]);

  // Eager refresh of newly-opened tabs — runs whenever tabs change.
  useEffect(() => {
    runtime.refreshNewTabs(() => contextRef.current);
  });
}

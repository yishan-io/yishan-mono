import { useEffect, useRef } from "react";
import {
  getProjectListPreferences,
  setProjectListPreferences,
} from "../../../features/project/commands/projectCommands";
import { getErrorMessage } from "../../../helpers/errorHelpers";
import type { ProjectListPreference } from "../../../rpc/daemonTypes";
import {
  EMPTY_FOLD_STATE,
  EMPTY_ORDER_STATE,
  FETCH_RETRY_BASE_MS,
  FETCH_RETRY_MAX_MS,
  type FoldState,
  type HierarchyMode,
  type OrderState,
  PUSH_DEBOUNCE_MS,
  buildPushPayload,
  buildSignatureFromPreferences,
  buildSignatureFromState,
  seedFromPreferences,
} from "./projectListPreferences";

type ProjectListPersistenceInput = {
  organizationId: string;
  orderStateByMode: Record<HierarchyMode, OrderState>;
  foldStateByMode: Record<HierarchyMode, FoldState>;
  workspaceOrderByParentId: Record<string, string[]>;
  setFoldStateByMode: React.Dispatch<React.SetStateAction<Record<HierarchyMode, FoldState>>>;
  setOrderStateByMode: React.Dispatch<React.SetStateAction<Record<HierarchyMode, OrderState>>>;
  setWorkspaceOrderByParentId: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
};

type PendingPush = {
  organizationId: string;
  preferences: ProjectListPreference;
};

/**
 * Persists the project list order/fold state to the daemon
 * (project.getListPreferences / project.setListPreferences).
 *
 * - On mount or org switch, persisted state is fetched and seeds local state.
 * - Fetches retry with backoff until they succeed; pushes are gated on a
 *   successful fetch so a cold boot (daemon not yet reachable) can never
 *   overwrite previously persisted state with defaults plus partial local
 *   changes.
 * - Changes after hydration are pushed debounced; the pending push is flushed
 *   on unmount and on beforeunload so a reorder immediately followed by an
 *   app restart is not lost.
 * - While the daemon is unreachable the list keeps working with in-memory
 *   state; any changes made before the first successful fetch are display-only
 *   and are replaced by the persisted state once it loads.
 */
export function useProjectListPersistence(input: ProjectListPersistenceInput): void {
  const {
    organizationId,
    orderStateByMode,
    foldStateByMode,
    workspaceOrderByParentId,
    setFoldStateByMode,
    setOrderStateByMode,
    setWorkspaceOrderByParentId,
  } = input;

  const hydratedRef = useRef(false);
  const lastPushedSignatureRef = useRef("");
  const pendingPushRef = useRef<PendingPush | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load persisted order/fold state when the org changes, retrying until the
  // daemon responds. Missing or corrupt state seeds empty defaults.
  useEffect(() => {
    const org = organizationId.trim();
    hydratedRef.current = false;
    lastPushedSignatureRef.current = "";
    pendingPushRef.current = null;
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setFoldStateByMode({
      by_project: { ...EMPTY_FOLD_STATE },
      by_node: { ...EMPTY_FOLD_STATE },
    });
    setOrderStateByMode({
      by_project: { ...EMPTY_ORDER_STATE, nodeOrderByParentId: {} },
      by_node: { ...EMPTY_ORDER_STATE, nodeOrderByParentId: {} },
    });
    setWorkspaceOrderByParentId({});
    if (!org) {
      return;
    }

    let cancelled = false;
    let attempt = 0;
    const fetchPreferences = async () => {
      try {
        const preferences = await getProjectListPreferences(org);
        if (cancelled) {
          return;
        }
        seedFromPreferences(preferences, setFoldStateByMode, setOrderStateByMode, setWorkspaceOrderByParentId);
        lastPushedSignatureRef.current = buildSignatureFromPreferences(preferences);
        hydratedRef.current = true;
      } catch (error) {
        console.error("Failed to load project list preferences", getErrorMessage(error));
        if (cancelled) {
          return;
        }
        attempt += 1;
        const delay = Math.min(FETCH_RETRY_BASE_MS * 2 ** (attempt - 1), FETCH_RETRY_MAX_MS);
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          void fetchPreferences();
        }, delay);
      }
    };
    void fetchPreferences();

    return () => {
      cancelled = true;
      if (retryTimerRef.current !== null) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [organizationId, setFoldStateByMode, setOrderStateByMode, setWorkspaceOrderByParentId]);

  // Debounced push of order/fold state to the daemon after hydration.
  useEffect(() => {
    if (!hydratedRef.current || !organizationId.trim()) {
      return;
    }
    const signature = buildSignatureFromState(orderStateByMode, foldStateByMode, workspaceOrderByParentId);
    if (signature === lastPushedSignatureRef.current) {
      return;
    }
    const preferences = buildPushPayload(orderStateByMode, foldStateByMode, workspaceOrderByParentId);
    pendingPushRef.current = { organizationId: organizationId.trim(), preferences };
    const timer = setTimeout(() => {
      lastPushedSignatureRef.current = signature;
      pendingPushRef.current = null;
      void pushPreferences(organizationId.trim(), preferences);
    }, PUSH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [foldStateByMode, orderStateByMode, organizationId, workspaceOrderByParentId]);

  // Flush a pending debounced push on unmount / beforeunload so the final
  // reorder survives an immediate app restart.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const flush = () => {
      if (pendingPushRef.current) {
        const pending = pendingPushRef.current;
        pendingPushRef.current = null;
        void pushPreferences(pending.organizationId, pending.preferences);
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);
}

async function pushPreferences(organizationId: string, preferences: ProjectListPreference): Promise<void> {
  try {
    await setProjectListPreferences(organizationId, preferences);
  } catch (error) {
    // The daemon may be temporarily unreachable; local state stays live and
    // the next change retries the push.
    console.error("Failed to persist project list preferences", getErrorMessage(error));
  }
}

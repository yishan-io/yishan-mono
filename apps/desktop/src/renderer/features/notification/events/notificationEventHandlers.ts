import { tabStore } from "@renderer/features/workbench";
import { workbenchNavigationStore } from "@renderer/features/workbench";
/**
 * Notification event handlers — owns notification.event effects: preference-
 * backed delivery, suppression policy, effect dedupe, system notification copy
 * building, and unread-badge recording.
 *
 * Phase 2 split from `backendEventStoreBindings.ts`. Observer-status agent
 * aggregation delegates to the Agent feature (`recordAgentObserverStatus`).
 * During the transition this factory is consumed by the binding (no
 * self-subscription); at Task 6 its default deps subscribe via the router.
 */
import type { RpcFrontendMessagePayload } from "../../../../shared/contracts/rpcSchema";
import type {
  NotificationEventType,
  NotificationPreferences,
} from "../../../../shared/notifications/notificationPreferences";
import { subscribeInAppNotificationEvent } from "../../../app/events/backendEventRouter.selectors";
import type { WorkspaceAgentStatus, WorkspaceUnreadTone } from "../../../features/agent";
import {
  recordWorkspaceUnreadNotification,
  setWorkspaceAgentStatusByWorkspaceId,
} from "../../../features/agent/state/chatActions";
import {
  dispatchNotification,
  getNotificationPreferences,
  playNotificationSound,
} from "../../../features/notification/commands/notificationCommands";
import { selectProjectById } from "../../../features/project/state/projectSelectors";
import { selectWorkspaces } from "../../../features/workspace/state/workspaceSelectors";

import { parseObserverSessionKey, recordAgentObserverStatus } from "../../agent/commands/agentSessionLifecycle";

const NOTIFICATION_EFFECT_DEDUPE_WINDOW_MS = 1_500;

export type NotificationEventPayload = RpcFrontendMessagePayload<"notificationEvent">;
export type NotificationSoundPayload = NonNullable<NotificationEventPayload["soundToPlay"]>;
export type SystemNotificationInput = { title: string; body?: string; silent?: boolean };

export type NotificationEventDependencies = {
  subscribeInAppNotification: (listener: (payload: NotificationEventPayload) => void) => () => void;
  setWorkspaceAgentStatusByWorkspaceId: (statusByWorkspaceId: Record<string, WorkspaceAgentStatus>) => void;
  recordWorkspaceUnreadNotification: (workspaceId: string, tone: WorkspaceUnreadTone) => void;
  dispatchSystemNotification: (input: SystemNotificationInput) => Promise<void>;
  playNotificationSound: (input: NotificationSoundPayload) => Promise<void>;
  getNotificationPreferences?: () => Promise<NotificationPreferences>;
  isRelevantTerminalFocused?: (payload: NotificationEventPayload) => boolean;
  resolveWorkspaceLabel?: (workspaceId: string) => string | undefined;
};

function resolveWorkspaceCopyLabel(
  payload: NotificationEventPayload,
  dependencies: NotificationEventDependencies,
): string | undefined {
  const workspaceId = payload.workspaceId?.trim();
  if (workspaceId) {
    const resolvedWorkspaceLabel = dependencies.resolveWorkspaceLabel?.(workspaceId)?.trim();
    if (resolvedWorkspaceLabel) {
      return resolvedWorkspaceLabel;
    }
  }

  const workspaceName = payload.workspaceName?.trim();
  return workspaceName || undefined;
}

function rewriteWorkspaceIdentifier(
  value: string | undefined,
  workspaceId: string | undefined,
  workspaceLabel: string | undefined,
): string | undefined {
  if (!value) {
    return value;
  }
  if (!workspaceId || !workspaceLabel || workspaceId === workspaceLabel) {
    return value;
  }

  return value.split(workspaceId).join(workspaceLabel);
}

export function buildSystemNotificationCopy(
  payload: NotificationEventPayload,
  dependencies: NotificationEventDependencies,
  silent?: boolean,
): SystemNotificationInput {
  const workspaceId = payload.workspaceId?.trim();
  const workspaceLabel = resolveWorkspaceCopyLabel(payload, dependencies);
  const title = rewriteWorkspaceIdentifier(payload.title, workspaceId, workspaceLabel) ?? payload.title;
  const body = rewriteWorkspaceIdentifier(payload.body, workspaceId, workspaceLabel);

  if (silent === undefined) {
    return { title, body };
  }

  return { title, body, silent };
}

export function resolveSystemNotificationSilence(payload: NotificationEventPayload): boolean | undefined {
  if (payload.silent === true) {
    return true;
  }

  if (payload.notificationEventType) {
    return true;
  }

  if (payload.soundToPlay) {
    return true;
  }

  return undefined;
}

function shouldDeliverPreferenceBackedNotification(
  preferences: NotificationPreferences,
  eventType: NotificationEventType,
): boolean {
  return preferences.enabled && preferences.enabledEventTypes.includes(eventType);
}

/**
 * Impure by design: reads document focus + tabStore + workspaceStore directly
 * (the default dependency implementation). Tests inject a fake via
 * `isRelevantTerminalFocused`.
 */
export function isRelevantTerminalFocusedForNotification(payload: NotificationEventPayload): boolean {
  if (typeof document === "undefined" || !document.hasFocus()) {
    return false;
  }

  const observerStatus = payload.observerStatus;
  if (!observerStatus) {
    return false;
  }

  const sessionParts = parseObserverSessionKey(observerStatus.sessionKey.trim());
  if (!sessionParts) {
    return false;
  }

  if (
    workbenchNavigationStore.getState().activeWorkspaceId !== sessionParts.workspaceId ||
    tabStore.getState().selectedTabId !== sessionParts.tabId
  ) {
    return false;
  }

  return tabStore.getState().tabs.some((tab) => tab.id === sessionParts.tabId && tab.kind === "terminal");
}

export function isNormalAgentCliExit(payload: NotificationEventPayload): boolean {
  return (
    payload.agent?.trim().toLowerCase() === "agent-cli" &&
    payload.observerStatus?.normalizedEventType === "stop" &&
    payload.tone === "success" &&
    payload.notificationEventType === "run-finished"
  );
}

export function shouldSuppressNotificationEffects(
  payload: NotificationEventPayload,
  dependencies: NotificationEventDependencies,
): boolean {
  return isNormalAgentCliExit(payload) || (dependencies.isRelevantTerminalFocused?.(payload) ?? false);
}

async function dispatchPreferenceBackedNotification(
  payload: NotificationEventPayload,
  dependencies: NotificationEventDependencies,
) {
  const eventType = payload.notificationEventType;
  if (!eventType || payload.silent === true) {
    return;
  }

  if (shouldSuppressNotificationEffects(payload, dependencies)) {
    return;
  }

  const preferences = await (dependencies.getNotificationPreferences ?? getNotificationPreferences)();
  if (!shouldDeliverPreferenceBackedNotification(preferences, eventType)) {
    return;
  }

  const notificationCopy = buildSystemNotificationCopy(
    payload,
    dependencies,
    resolveSystemNotificationSilence(payload),
  );

  if (preferences.osEnabled) {
    await dependencies.dispatchSystemNotification(notificationCopy);
  }

  if (preferences.soundEnabled && preferences.volume > 0) {
    await dependencies.playNotificationSound({
      soundId: preferences.eventSounds[eventType],
      volume: preferences.volume,
    });
  }
}

/** Handles one in-app notification payload (observer status + effects). */
export function handleInAppNotification(
  payload: NotificationEventPayload,
  dependencies: NotificationEventDependencies,
  notificationEffectTimeoutsById: Map<string, ReturnType<typeof setTimeout>>,
): void {
  recordAgentObserverStatus(payload, {
    setWorkspaceAgentStatusByWorkspaceId: dependencies.setWorkspaceAgentStatusByWorkspaceId,
  });

  const hasRecentlyHandledNotificationId = (): boolean => {
    const notificationId = payload.id.trim();
    if (!notificationId) {
      return false;
    }

    if (notificationEffectTimeoutsById.has(notificationId)) {
      return true;
    }

    const timeoutId = setTimeout(() => {
      notificationEffectTimeoutsById.delete(notificationId);
    }, NOTIFICATION_EFFECT_DEDUPE_WINDOW_MS);
    notificationEffectTimeoutsById.set(notificationId, timeoutId);
    return false;
  };

  if (hasRecentlyHandledNotificationId()) {
    return;
  }

  const suppressNotificationEffects = shouldSuppressNotificationEffects(payload, dependencies);

  if (payload.notificationEventType) {
    void dispatchPreferenceBackedNotification(payload, dependencies).catch(() => {
      // Preference resolution and delivery failures should not block store state updates.
    });
  } else if (payload.showSystemNotification && !suppressNotificationEffects) {
    const notificationCopy = buildSystemNotificationCopy(
      payload,
      dependencies,
      resolveSystemNotificationSilence(payload),
    );
    void dependencies.dispatchSystemNotification(notificationCopy).catch(() => {
      // Notification delivery failures should not block store state updates.
    });
  }

  if (payload.soundToPlay && !suppressNotificationEffects) {
    void dependencies.playNotificationSound(payload.soundToPlay).catch(() => {
      // Sound playback failures should not block store state updates.
    });
  }

  const workspaceId = payload.workspaceId?.trim();
  if (payload.silent === true || !workspaceId) {
    return;
  }

  const tone: WorkspaceUnreadTone = payload.tone === "error" ? "error" : "success";
  dependencies.recordWorkspaceUnreadNotification(workspaceId, tone);
}

export const DEFAULT_NOTIFICATION_EVENT_DEPENDENCIES: NotificationEventDependencies = {
  subscribeInAppNotification: (listener) => subscribeInAppNotificationEvent(listener),
  setWorkspaceAgentStatusByWorkspaceId: (statusByWorkspaceId) => {
    setWorkspaceAgentStatusByWorkspaceId(statusByWorkspaceId);
  },
  recordWorkspaceUnreadNotification: (workspaceId, tone) => {
    recordWorkspaceUnreadNotification(workspaceId, tone);
  },
  dispatchSystemNotification: async (input) => {
    await dispatchNotification(input);
  },
  playNotificationSound: async (input) => {
    await playNotificationSound(input);
  },
  getNotificationPreferences,
  isRelevantTerminalFocused: isRelevantTerminalFocusedForNotification,
  resolveWorkspaceLabel: (workspaceId) => {
    const workspace = selectWorkspaces().find((candidate) => candidate.id === workspaceId);
    const workspaceName = workspace?.name?.trim();
    if (!workspaceName) {
      return undefined;
    }

    const projectName = selectProjectById(workspace?.projectId ?? "")?.name?.trim();
    return projectName ? `${projectName} / ${workspaceName}` : workspaceName;
  },
};

/**
 * Starts notification event handlers with default deps.
 */
export function startNotificationEventHandlers() {
  return createNotificationEventHandlers(DEFAULT_NOTIFICATION_EVENT_DEPENDENCIES)();
}

/**
 * Creates one notification event handler factory. Returns `start()` which
 * subscribes to notification.event and returns a teardown.
 */
export function createNotificationEventHandlers(dependencies: NotificationEventDependencies) {
  const resolvedDependencies = {
    ...DEFAULT_NOTIFICATION_EVENT_DEPENDENCIES,
    ...dependencies,
  } satisfies NotificationEventDependencies;
  return function startNotificationEventHandlers() {
    const notificationEffectTimeoutsById = new Map<string, ReturnType<typeof setTimeout>>();

    const unsubscribeInAppNotification = resolvedDependencies.subscribeInAppNotification((payload) => {
      handleInAppNotification(payload, resolvedDependencies, notificationEffectTimeoutsById);
    });

    return () => {
      unsubscribeInAppNotification();
      for (const timeoutId of notificationEffectTimeoutsById.values()) {
        clearTimeout(timeoutId);
      }
      notificationEffectTimeoutsById.clear();
    };
  };
}

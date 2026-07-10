import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/features/auth";
import { useAppLanguage } from "@/features/i18n/AppLanguageProvider";
import { useMeQuery } from "@/features/me/queries/useMeQuery";
import { useProjectsQuery } from "@/features/projects/queries/useProjectsQuery";
import type { NotificationRuntimeContextValue, WorkspaceUnreadTone } from "../notification-runtime-context";
import {
  appendSeenNotificationId,
  buildInAppNotificationBanner,
  buildNodeConnectionMetas,
  buildWorkspaceMetaById,
  clearWorkspaceUnreadTone,
  createEmptyNotificationRuntimeValue,
  deriveNextWorkspaceUnreadTones,
  isNotificationStreamMessage,
  readNotificationTarget,
  reduceLifecycleState,
  shouldConnectNotificationStream,
  shouldPresentNotificationEvent,
} from "../notification-runtime-domain";
import type {
  FrontendEventsWebSocketMessage,
  NodeConnectionMeta,
  RuntimeLifecycleState,
} from "../notification-runtime-helpers";
import { useNotificationBannerController } from "./useNotificationBannerController";
import { useNotificationEventStream } from "./useNotificationEventStream";
import { useNotificationPermission } from "./useNotificationPermission";
import { useNotificationRouteContext } from "./useNotificationRouteContext";

export function useNotificationRuntimeModel() {
  const { t } = useAppLanguage();
  const { currentWorkspaceContext } = useNotificationRouteContext();
  const { session, status } = useAuth();
  const meQuery = useMeQuery();
  const notificationPermission = useNotificationPermission();
  const lifecycleBySessionKeyRef = useRef<Map<string, RuntimeLifecycleState>>(new Map());
  const seenNotificationIdsRef = useRef<string[]>([]);
  const [terminalAgentStatusByTerminalId, setTerminalAgentStatusByTerminalId] = useState<
    NotificationRuntimeContextValue["terminalAgentStatusByTerminalId"]
  >({});
  const [workspaceAgentStatusByWorkspaceId, setWorkspaceAgentStatusByWorkspaceId] = useState<
    NotificationRuntimeContextValue["workspaceAgentStatusByWorkspaceId"]
  >({});
  const [workspaceUnreadToneByWorkspaceId, setWorkspaceUnreadToneByWorkspaceId] = useState<
    Record<string, WorkspaceUnreadTone>
  >({});
  const { activeBanner, dismissBanner, openActiveBanner, scheduleNativeNotification, showBanner } =
    useNotificationBannerController({
      notificationPermissionStatus: notificationPermission.status,
      osNotificationsEnabled: meQuery.data?.notificationPreferences.osEnabled,
    });

  const currentOrganizationId = currentWorkspaceContext?.orgId ?? null;
  const projectsQuery = useProjectsQuery(currentOrganizationId ?? "", {
    enabled: !!currentOrganizationId,
    withWorkspaces: true,
  });

  const workspaceMetaById = useMemo(() => buildWorkspaceMetaById(projectsQuery.data ?? [], t), [projectsQuery.data, t]);

  const nodeConnectionMetas = useMemo(() => buildNodeConnectionMetas(workspaceMetaById), [workspaceMetaById]);
  const currentWorkspaceId = currentWorkspaceContext?.workspaceId ?? null;

  useEffect(() => {
    if (!currentWorkspaceId) {
      return;
    }

    setWorkspaceUnreadToneByWorkspaceId((current) => clearWorkspaceUnreadTone(current, currentWorkspaceId));
  }, [currentWorkspaceId]);

  useEffect(() => {
    lifecycleBySessionKeyRef.current.clear();
    seenNotificationIdsRef.current = [];
    if (currentOrganizationId === null) {
      const emptyState = createEmptyNotificationRuntimeValue();
      setTerminalAgentStatusByTerminalId(emptyState.terminalAgentStatusByTerminalId);
      setWorkspaceAgentStatusByWorkspaceId(emptyState.workspaceAgentStatusByWorkspaceId);
      setWorkspaceUnreadToneByWorkspaceId(emptyState.workspaceUnreadToneByWorkspaceId);
      return;
    }

    const emptyState = createEmptyNotificationRuntimeValue();
    setTerminalAgentStatusByTerminalId(emptyState.terminalAgentStatusByTerminalId);
    setWorkspaceAgentStatusByWorkspaceId(emptyState.workspaceAgentStatusByWorkspaceId);
    setWorkspaceUnreadToneByWorkspaceId(emptyState.workspaceUnreadToneByWorkspaceId);
  }, [currentOrganizationId]);

  const notificationPreferences = meQuery.data?.notificationPreferences;
  const canConnect = shouldConnectNotificationStream({
    accessToken: session?.accessToken,
    currentOrganizationId,
    nodeConnectionMetas,
    notificationPreferences,
    status,
  });

  const handleStreamMessage = useCallback(
    ({
      message,
      node,
    }: {
      message: FrontendEventsWebSocketMessage;
      node: NodeConnectionMeta;
    }) => {
      if (!isNotificationStreamMessage(message)) {
        return;
      }

      const payload = message.payload;
      const { targetWorkspaceId, terminalId } = readNotificationTarget({
        node,
        payload,
      });

      const lifecycleState = reduceLifecycleState({
        lifecycleBySessionKey: lifecycleBySessionKeyRef.current,
        node,
        payload,
        targetWorkspaceId,
        terminalId,
      });
      if (lifecycleState) {
        setWorkspaceAgentStatusByWorkspaceId(lifecycleState.workspaceAgentStatusByWorkspaceId);
        setTerminalAgentStatusByTerminalId(lifecycleState.terminalAgentStatusByTerminalId);
      }

      setWorkspaceUnreadToneByWorkspaceId((current) =>
        deriveNextWorkspaceUnreadTones(current, {
          activeWorkspaceId: currentWorkspaceId,
          payload,
          targetWorkspaceId,
        }),
      );

      const nextSeenIds = appendSeenNotificationId(seenNotificationIdsRef.current, payload.id);
      if (nextSeenIds === seenNotificationIdsRef.current) {
        return;
      }
      seenNotificationIdsRef.current = nextSeenIds;

      if (!shouldPresentNotificationEvent(payload, notificationPreferences)) {
        return;
      }

      const banner = buildInAppNotificationBanner({
        fallbackWorkspaceLabel: t("settings.notificationsWorkspaceFallback"),
        node,
        payload,
        targetWorkspaceId,
        terminalId,
        t,
        workspaceMetaById,
      });

      showBanner(banner);
      void scheduleNativeNotification(banner, payload.notificationEventType);
    },
    [currentWorkspaceId, notificationPreferences, scheduleNativeNotification, showBanner, t, workspaceMetaById],
  );

  useNotificationEventStream({
    accessToken: session?.accessToken ?? null,
    enabled: canConnect,
    nodes: nodeConnectionMetas,
    onMessage: handleStreamMessage,
  });

  const runtimeValue = useMemo<NotificationRuntimeContextValue>(
    () => ({
      terminalAgentStatusByTerminalId,
      workspaceAgentStatusByWorkspaceId,
      workspaceUnreadToneByWorkspaceId,
    }),
    [terminalAgentStatusByTerminalId, workspaceAgentStatusByWorkspaceId, workspaceUnreadToneByWorkspaceId],
  );

  return {
    activeBanner,
    dismissBanner,
    openActiveBanner,
    runtimeValue,
  };
}

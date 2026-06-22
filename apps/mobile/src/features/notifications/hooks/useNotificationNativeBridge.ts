import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";

import { readStringData } from "../notification-runtime-helpers";

function navigateToNotificationTarget(input: {
  orgId: string;
  projectId: string;
  router: ReturnType<typeof useRouter>;
  terminalId: string | null;
  workspaceId: string;
}) {
  input.router.push({
    pathname: "/(app)/shell",
    params: {
      kind: input.terminalId ? "terminal" : "workspace",
      orgId: input.orgId,
      projectId: input.projectId,
      ...(input.terminalId ? { terminalId: input.terminalId } : {}),
      workspaceId: input.workspaceId,
    },
  });
}

/** Owns native notification response handling and shell navigation bridging. */
export function useNotificationNativeBridge() {
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") {
      return;
    }

    let disposed = false;
    let removeResponseListener = () => {};

    void import("expo-notifications")
      .then((Notifications) => {
        if (disposed) {
          return;
        }

        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldPlaySound: true,
            shouldSetBadge: false,
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });

        const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
          const data = response.notification.request.content.data ?? {};
          const orgId = readStringData(data.orgId);
          const projectId = readStringData(data.projectId);
          const workspaceId = readStringData(data.workspaceId);
          const terminalId = readStringData(data.terminalId);
          if (!orgId || !projectId || !workspaceId) {
            return;
          }

          navigateToNotificationTarget({
            orgId,
            projectId,
            router,
            terminalId: terminalId || null,
            workspaceId,
          });
        });

        removeResponseListener = () => {
          responseSubscription.remove();
          Notifications.setNotificationHandler(null);
        };
      })
      .catch(() => {
        // Best-effort native integration only.
      });

    return () => {
      disposed = true;
      removeResponseListener();
    };
  }, [router]);

  return {
    navigateToNotificationTarget: (input: {
      orgId: string;
      projectId: string;
      terminalId: string | null;
      workspaceId: string;
    }) => navigateToNotificationTarget({ ...input, router }),
  };
}

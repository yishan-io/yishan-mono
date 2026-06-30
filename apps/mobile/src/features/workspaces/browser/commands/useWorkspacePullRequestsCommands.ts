import { useCallback } from "react";
import { Linking } from "react-native";

export function useWorkspacePullRequestsCommands() {
  const openPullRequest = useCallback(async (url: string | null) => {
    if (!url) {
      return;
    }

    try {
      await Linking.openURL(url);
    } catch {
      // Ignore open-url failures from the action button.
    }
  }, []);

  return {
    openPullRequest,
  };
}

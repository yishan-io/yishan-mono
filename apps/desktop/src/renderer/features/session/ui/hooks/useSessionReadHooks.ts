import { useShallow } from "zustand/react/shallow";
import { sessionStore } from "../../state/sessionStore";

/**
 * Session feature read-only hooks — the stable read surface for Session State
 * (Phase 17, desktop6.md). Cross-feature UI subscribes to session state
 * through these hooks instead of importing the Session Store directly.
 */

/** Subscribes to the selected organization id. */
export function useSelectedOrganizationId() {
  return sessionStore((state) => state.selectedOrganizationId);
}

/** Subscribes to the local daemon id. */
export function useDaemonId() {
  return sessionStore((state) => state.daemonId);
}

/** Subscribes to the organization list. */
export function useOrganizations() {
  return sessionStore((state) => state.organizations);
}

/** Subscribes to daemon and app version strings. */
export function useSessionVersions() {
  return sessionStore(
    useShallow((state) => ({
      daemonVersion: state.daemonVersion,
      appVersion: state.appVersion,
    })),
  );
}

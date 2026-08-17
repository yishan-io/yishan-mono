// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { sessionStore } from "../../../features/session/state/sessionStore";

const initialSessionState = sessionStore.getState();

afterEach(() => {
  sessionStore.setState(initialSessionState, true);
});

describe("../../../features/session/state/sessionStore", () => {
  it("normalizes the selected organization to the first organization when none is selected", () => {
    sessionStore.getState().setSessionData({
      currentUser: { id: "user-1", email: "a@yishan.io", name: null, avatarUrl: null },
      organizations: [
        { id: "org-1", name: "One" },
        { id: "org-2", name: "Two" },
      ],
    });

    const state = sessionStore.getState();
    expect(state.selectedOrganizationId).toBe("org-1");
    expect(state.loaded).toBe(true);
    expect(state.currentUserId).toBe("user-1");
  });

  it("keeps an explicitly selected organization when it exists", () => {
    sessionStore.getState().setSessionData({
      currentUser: null,
      organizations: [
        { id: "org-1", name: "One" },
        { id: "org-2", name: "Two" },
      ],
      selectedOrganizationId: "org-2",
    });

    expect(sessionStore.getState().selectedOrganizationId).toBe("org-2");
  });

  it("falls back to the first organization when the selected id is unknown", () => {
    sessionStore.getState().setSessionData({
      currentUser: null,
      organizations: [{ id: "org-1", name: "One" }],
      selectedOrganizationId: "org-missing",
    });

    expect(sessionStore.getState().selectedOrganizationId).toBe("org-1");
  });

  it("rejects selecting an organization that is not in the list", () => {
    sessionStore.getState().setSessionData({
      currentUser: null,
      organizations: [{ id: "org-1", name: "One" }],
      selectedOrganizationId: "org-1",
    });

    sessionStore.getState().setSelectedOrganizationId("org-unknown");

    expect(sessionStore.getState().selectedOrganizationId).toBe("org-1");
  });

  it("records voice usage for one organization only", () => {
    sessionStore.getState().setSessionData({
      currentUser: null,
      organizations: [
        { id: "org-1", name: "One" },
        { id: "org-2", name: "Two" },
      ],
    });

    sessionStore.getState().setOrganizationVoiceUsage("org-2", {
      quotaMinutes: 10,
      usedSeconds: 30,
      remainingSeconds: 570,
    });

    const organizations = sessionStore.getState().organizations;
    expect(organizations[0]?.voiceUsage).toBeUndefined();
    expect(organizations[1]?.voiceUsage).toEqual({
      quotaMinutes: 10,
      usedSeconds: 30,
      remainingSeconds: 570,
    });
  });

  it("trims daemon info and app version", () => {
    sessionStore.getState().setDaemonInfo({ daemonId: "  daemon-1  ", daemonVersion: "1.2.3 " });
    sessionStore.getState().setAppVersion(" 0.1.0 ");

    const state = sessionStore.getState();
    expect(state.daemonId).toBe("daemon-1");
    expect(state.daemonVersion).toBe("1.2.3");
    expect(state.appVersion).toBe("0.1.0");
  });

  it("clears session data while keeping auth flags intact", () => {
    sessionStore.getState().setSessionData({
      currentUser: { id: "user-1", email: "a@yishan.io", name: null, avatarUrl: null },
      organizations: [{ id: "org-1", name: "One" }],
      selectedOrganizationId: "org-1",
    });
    sessionStore.getState().setAuthState(true, true);

    sessionStore.getState().clearSessionData();

    const state = sessionStore.getState();
    expect(state.currentUser).toBeNull();
    expect(state.currentUserId).toBeNull();
    expect(state.organizations).toEqual([]);
    expect(state.selectedOrganizationId).toBeUndefined();
    expect(state.loaded).toBe(false);
    // Auth flags survive a session-data clear (auth status is app-level).
    expect(state.isAuthenticated).toBe(true);
    expect(state.authStatusResolved).toBe(true);
  });

  it("sets auth state flags", () => {
    sessionStore.getState().setAuthState(true, true);
    expect(sessionStore.getState().isAuthenticated).toBe(true);
    expect(sessionStore.getState().authStatusResolved).toBe(true);

    sessionStore.getState().setAuthState(false, true);
    expect(sessionStore.getState().isAuthenticated).toBe(false);
    expect(sessionStore.getState().authStatusResolved).toBe(true);
  });
});

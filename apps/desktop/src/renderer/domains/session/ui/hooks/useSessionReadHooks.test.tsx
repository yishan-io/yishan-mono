// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { sessionStore } from "../../state/sessionStore";
import { useDaemonId, useOrganizations, useSelectedOrganizationId, useSessionVersions } from "./useSessionReadHooks";

const initialSessionState = sessionStore.getState();

afterEach(() => {
  sessionStore.setState(initialSessionState, true);
});

describe("useSessionReadHooks — Session state read hooks (Phase 17)", () => {
  it("useSelectedOrganizationId subscribes to the selection", () => {
    sessionStore.setState({ selectedOrganizationId: "org-1" });

    const { result } = renderHook(() => useSelectedOrganizationId());

    expect(result.current).toBe("org-1");
  });

  it("useDaemonId subscribes to the daemon id", () => {
    sessionStore.setState({ daemonId: "node-1" });

    const { result } = renderHook(() => useDaemonId());

    expect(result.current).toBe("node-1");
  });

  it("useOrganizations subscribes to the organization list", () => {
    const organizations = [{ id: "org-1", name: "A" }];
    sessionStore.setState({ organizations } as never);

    const { result } = renderHook(() => useOrganizations());

    expect(result.current).toEqual(organizations);
  });

  it("useSessionVersions subscribes to version strings", () => {
    sessionStore.setState({ daemonVersion: "0.20.1", appVersion: "0.20.2" } as never);

    const { result } = renderHook(() => useSessionVersions());

    expect(result.current).toEqual({ daemonVersion: "0.20.1", appVersion: "0.20.2" });
  });
});

import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api/errors";
import type { StoredSession } from "@/lib/storage/session-storage";

import { bootstrapAuthSessionRuntime } from "./auth-session-bootstrap";

const storedSession: StoredSession = {
  accessToken: "access",
  accessTokenExpiresAt: "2026-06-16T00:00:30.000Z",
  refreshToken: "refresh",
  refreshTokenExpiresAt: "2026-06-17T00:00:00.000Z",
  tokenType: "Bearer",
};

describe("bootstrapAuthSessionRuntime", () => {
  it("clears local state when no session is stored", async () => {
    const clearSessionState = vi.fn(async () => {});

    await bootstrapAuthSessionRuntime({
      applyAuthenticatedSession: vi.fn(async () => {}),
      clearSessionState,
      commitAuthenticatedSessionState: vi.fn(),
      loadStoredSession: vi.fn(async () => null),
      refreshSession: vi.fn(async () => storedSession),
    });

    expect(clearSessionState).toHaveBeenCalledTimes(1);
  });

  it("commits stored state without refresh when token is still fresh", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T00:00:00.000Z"));
    const commitAuthenticatedSessionState = vi.fn();
    const refreshSession = vi.fn(async () => storedSession);

    await bootstrapAuthSessionRuntime({
      applyAuthenticatedSession: vi.fn(async () => {}),
      clearSessionState: vi.fn(async () => {}),
      commitAuthenticatedSessionState,
      loadStoredSession: vi.fn(async () => ({
        ...storedSession,
        accessTokenExpiresAt: "2026-06-16T00:10:00.000Z",
      })),
      refreshSession,
    });

    expect(commitAuthenticatedSessionState).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("refreshes soon-expiring sessions", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T00:00:00.000Z"));
    const applyAuthenticatedSession = vi.fn(async () => {});

    await bootstrapAuthSessionRuntime({
      applyAuthenticatedSession,
      clearSessionState: vi.fn(async () => {}),
      commitAuthenticatedSessionState: vi.fn(),
      loadStoredSession: vi.fn(async () => storedSession),
      refreshSession: vi.fn(async () => ({
        ...storedSession,
        accessToken: "fresh",
      })),
    });

    expect(applyAuthenticatedSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "fresh",
      }),
    );
  });

  it("clears invalid sessions on auth refresh failure", async () => {
    const clearSessionState = vi.fn(async () => {});

    await bootstrapAuthSessionRuntime({
      applyAuthenticatedSession: vi.fn(async () => {}),
      clearSessionState,
      commitAuthenticatedSessionState: vi.fn(),
      loadStoredSession: vi.fn(async () => storedSession),
      refreshSession: vi.fn(async () => {
        throw new ApiError("auth required", 401, "AUTH_REQUIRED");
      }),
    });

    expect(clearSessionState).toHaveBeenCalledTimes(1);
  });

  it("keeps the committed stored session on transient refresh failure", async () => {
    const clearSessionState = vi.fn(async () => {});
    const commitAuthenticatedSessionState = vi.fn();

    await bootstrapAuthSessionRuntime({
      applyAuthenticatedSession: vi.fn(async () => {}),
      clearSessionState,
      commitAuthenticatedSessionState,
      loadStoredSession: vi.fn(async () => storedSession),
      refreshSession: vi.fn(async () => {
        throw new ApiError("server error", 500, "SERVER_ERROR");
      }),
    });

    expect(commitAuthenticatedSessionState).toHaveBeenCalledTimes(1);
    expect(clearSessionState).not.toHaveBeenCalled();
  });
});

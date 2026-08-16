import { describe, expect, it, vi } from "vitest";
import { isPermissionAllowed, registerPermissionPolicy } from "./permissionPolicy";

type PermissionHandler = (
  webContents: { id: number } | undefined,
  permission: string,
  callback: (allowed: boolean) => void,
) => void;
type PermissionCheck = (webContents: { id: number } | undefined, permission: string) => boolean;

const mocks = vi.hoisted(() => ({
  requestHandler: null as PermissionHandler | null,
  checkHandler: null as PermissionCheck | null,
}));

vi.mock("electron", () => ({
  session: {
    defaultSession: {},
  },
}));

function createMockSession() {
  return {
    setPermissionRequestHandler: (handler: PermissionHandler) => {
      mocks.requestHandler = handler;
    },
    setPermissionCheckHandler: (handler: PermissionCheck) => {
      mocks.checkHandler = handler;
    },
  } as never;
}

describe("permissionPolicy", () => {
  it("allows the allowlisted permissions and denies others", () => {
    for (const permission of ["media", "clipboard-read", "clipboard-write", "clipboard-sanitized-write"]) {
      expect(isPermissionAllowed(permission)).toBe(true);
    }
    for (const permission of ["geolocation", "notifications", "unknown-permission", ""]) {
      expect(isPermissionAllowed(permission)).toBe(false);
    }
  });

  it("scopes clipboard grants to the main window webContents id", () => {
    const session = createMockSession();
    const isMainWindow = (id: number) => id === 100;
    registerPermissionPolicy(session, isMainWindow);

    const requestHandler = mocks.requestHandler!;
    const checkHandler = mocks.checkHandler!;

    // Main window: clipboard allowed.
    let result = false;
    requestHandler({ id: 100 }, "clipboard-read", (allowed) => {
      result = allowed;
    });
    expect(result).toBe(true);

    // Non-main webContents: clipboard denied.
    requestHandler({ id: 200 }, "clipboard-read", (allowed) => {
      result = allowed;
    });
    expect(result).toBe(false);

    // Media allowed everywhere.
    requestHandler({ id: 200 }, "media", (allowed) => {
      result = allowed;
    });
    expect(result).toBe(true);

    // Check handler mirrors the same policy.
    expect(checkHandler({ id: 100 }, "clipboard-write")).toBe(true);
    expect(checkHandler({ id: 200 }, "clipboard-write")).toBe(false);
  });
});

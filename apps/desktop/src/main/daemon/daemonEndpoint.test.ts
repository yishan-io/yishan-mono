import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  homedir: vi.fn<() => string>(),
  isDevMode: vi.fn<() => boolean>(),
  readFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({ readFile: mocks.readFile }));
vi.mock("node:os", () => ({ homedir: mocks.homedir }));
vi.mock("../runtime/environment", () => ({ isDevMode: mocks.isDevMode }));

import {
  readActiveAccountUserId,
  readPersistedDaemonId,
  resolveAccountDaemonLogFilePath,
  resolveCliProfileName,
  resolveDaemonHealthUrl,
  resolveDaemonIdFilePath,
  resolveDaemonLogFilePath,
  resolveLegacyDaemonLogFilePath,
  resolveDaemonProfilePath,
  resolveDaemonStateFilePath,
  resolveDaemonWebSocketUrl,
  resolveDaemonWsUrlFromHealthUrl,
} from "./daemonEndpoint";

const daemonEnvironmentKeys = ["YISHAN_DAEMON_HEALTH_URL", "YISHAN_DAEMON_WS_URL", "YISHAN_PROFILE"] as const;
const originalDaemonEnvironment = new Map(daemonEnvironmentKeys.map((key) => [key, process.env[key]]));

beforeEach(() => {
  for (const key of daemonEnvironmentKeys) delete process.env[key];
  mocks.homedir.mockReset().mockReturnValue("/test-home");
  mocks.isDevMode.mockReset().mockReturnValue(false);
  mocks.readFile.mockReset();
});

afterEach(() => {
  for (const key of daemonEnvironmentKeys) {
    const originalValue = originalDaemonEnvironment.get(key);
    if (originalValue === undefined) delete process.env[key];
    else process.env[key] = originalValue;
  }
});

describe("daemon endpoint resolution", () => {
  it("uses development mode before YISHAN_PROFILE, then the configured and default profiles", () => {
    expect(resolveCliProfileName()).toBe("default");

    process.env.YISHAN_PROFILE = "  personal  ";
    expect(resolveCliProfileName()).toBe("personal");

    mocks.isDevMode.mockReturnValue(true);
    expect(resolveCliProfileName()).toBe("dev");
  });

  it("resolves profile state, id, and log paths", () => {
    process.env.YISHAN_PROFILE = "personal";
    const profilePath = resolve("/test-home", ".yishan", "profiles", "personal");

    expect(resolveDaemonProfilePath()).toBe(profilePath);
    expect(resolveDaemonStateFilePath()).toBe(resolve(profilePath, "daemon.state.json"));
    expect(resolveDaemonIdFilePath()).toBe(resolve(profilePath, "daemon.id"));
    expect(resolveDaemonLogFilePath()).toBe(resolve(profilePath, "logs", "system.log"));
    expect(resolveLegacyDaemonLogFilePath()).toBe(resolve(profilePath, "logs", "daemon.log"));
  });

  it("resolves account log paths only for a safe active account id", async () => {
    process.env.YISHAN_PROFILE = "personal";
    mocks.readFile.mockResolvedValueOnce("user_id: user_123\napi_token: secret\n");

    await expect(readActiveAccountUserId()).resolves.toBe("user_123");
    expect(resolveAccountDaemonLogFilePath("user_123")).toBe(
      "/test-home/.yishan/profiles/personal/accounts/user_123/logs/runtime.log",
    );

    mocks.readFile.mockResolvedValueOnce("user_id: ../../other-account\n");
    await expect(readActiveAccountUserId()).resolves.toBeNull();
    expect(resolveAccountDaemonLogFilePath("../other-account")).toBeNull();
  });

  it("prefers the explicit health URL over the WebSocket URL", async () => {
    process.env.YISHAN_DAEMON_HEALTH_URL = "  https://health.example.test/healthz  ";
    process.env.YISHAN_DAEMON_WS_URL = "ws://socket.example.test/ws";

    await expect(resolveDaemonHealthUrl()).resolves.toBe("https://health.example.test/healthz");
  });

  it("maps an explicit WebSocket URL to the corresponding health URL", async () => {
    process.env.YISHAN_DAEMON_WS_URL = "wss://relay.example.test/ws";

    await expect(resolveDaemonHealthUrl()).resolves.toBe("https://relay.example.test/healthz");
  });

  it("ignores inherited endpoint overrides in development mode", async () => {
    mocks.isDevMode.mockReturnValue(true);
    mocks.readFile.mockResolvedValue(JSON.stringify({ host: "127.0.0.1", port: 65000 }));
    process.env.YISHAN_PROFILE = "default";
    process.env.YISHAN_DAEMON_HEALTH_URL = "http://127.0.0.1:59066/healthz";
    process.env.YISHAN_DAEMON_WS_URL = "ws://127.0.0.1:59066/ws";

    await expect(resolveDaemonHealthUrl()).resolves.toBe("http://127.0.0.1:65000/healthz");
    await expect(resolveDaemonWebSocketUrl()).resolves.toBe("ws://127.0.0.1:65000/ws");
    expect(mocks.readFile).toHaveBeenCalledWith("/test-home/.yishan/profiles/dev/daemon.state.json", "utf8");
  });

  it("prefers the explicit WebSocket URL over the health URL", async () => {
    process.env.YISHAN_DAEMON_HEALTH_URL = "https://health.example.test/healthz";
    process.env.YISHAN_DAEMON_WS_URL = "  wss://socket.example.test/ws  ";

    await expect(resolveDaemonWebSocketUrl()).resolves.toBe("wss://socket.example.test/ws");
  });

  it("maps a relay health URL to its WebSocket URL", () => {
    expect(resolveDaemonWsUrlFromHealthUrl("https://relay.example.test/healthz")).toBe("wss://relay.example.test/ws");
    expect(resolveDaemonWsUrlFromHealthUrl("http://relay.example.test/healthz")).toBe("ws://relay.example.test/ws");
  });

  it("falls back to persisted state when an environment endpoint is invalid", async () => {
    mocks.readFile.mockResolvedValue(JSON.stringify({ host: " 127.0.0.1 ", port: 65000 }));
    process.env.YISHAN_DAEMON_WS_URL = "not a url";

    await expect(resolveDaemonHealthUrl()).resolves.toBe("http://127.0.0.1:65000/healthz");

    process.env.YISHAN_DAEMON_WS_URL = "";
    process.env.YISHAN_DAEMON_HEALTH_URL = "not a url";

    await expect(resolveDaemonWebSocketUrl()).resolves.toBe("ws://127.0.0.1:65000/ws");
    expect(mocks.readFile).toHaveBeenCalledTimes(2);
  });

  it("returns the trimmed persisted daemon id and an empty value when it cannot be read", async () => {
    mocks.readFile.mockResolvedValueOnce(" daemon-123 \n").mockRejectedValueOnce(new Error("missing"));

    await expect(readPersistedDaemonId()).resolves.toBe("daemon-123");
    await expect(readPersistedDaemonId()).resolves.toBe("");
  });
});

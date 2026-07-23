// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureAgentChatEventRouterReady,
  registerAgentChatEventRouter,
} from "./agentChatEventRouter";

const mocks = vi.hoisted(() => ({
  subscribeDesktopRpcEvent: vi.fn<(listener: (envelope: { method: string; payload: unknown }) => void) => () => void>(),
  rawListeners: new Set<(envelope: { method: string; payload: unknown }) => void>(),
}));

vi.mock("../rpc/rpcTransport", () => ({
  subscribeDesktopRpcEvent: mocks.subscribeDesktopRpcEvent,
}));

beforeEach(() => {
  mocks.rawListeners.clear();
  mocks.subscribeDesktopRpcEvent.mockReset();
  mocks.subscribeDesktopRpcEvent.mockImplementation(
    (listener: (envelope: { method: string; payload: unknown }) => void) => {
      mocks.rawListeners.add(listener);
      return () => {
        mocks.rawListeners.delete(listener);
      };
    },
  );
});

afterEach(() => {
  vi.clearAllMocks();
});

function emitPiEvent(payload: {
  sessionId: string;
  tabId: string;
  workspaceId: string;
  event: Record<string, unknown>;
}) {
  for (const listener of mocks.rawListeners) {
    listener({
      method: "agent.pi.event",
      payload,
    });
  }
}

describe("agentChatEventRouter", () => {
  describe("shared subscription", () => {
    it("uses exactly one subscribeDesktopRpcEvent listener regardless of registration count", () => {
      const disposeA = registerAgentChatEventRouter({
        tabId: "tab-a",
        sessionId: "session-a",
        onEvent: vi.fn(),
      });
      const disposeB = registerAgentChatEventRouter({
        tabId: "tab-b",
        sessionId: "session-b",
        onEvent: vi.fn(),
      });

      expect(mocks.subscribeDesktopRpcEvent).toHaveBeenCalledTimes(1);

      disposeA();
      disposeB();
    });

    it("does not create a second transport listener when registrations are re-added after all are disposed", () => {
      const disposeA = registerAgentChatEventRouter({
        tabId: "tab-a",
        sessionId: "session-a",
        onEvent: vi.fn(),
      });
      disposeA();

      expect(mocks.subscribeDesktopRpcEvent).toHaveBeenCalledTimes(1);
      expect(mocks.rawListeners.size).toBe(0);

      const disposeB = registerAgentChatEventRouter({
        tabId: "tab-b",
        sessionId: "session-b",
        onEvent: vi.fn(),
      });

      // Should re-create the transport listener
      expect(mocks.subscribeDesktopRpcEvent).toHaveBeenCalledTimes(2);
      disposeB();
    });
  });

  describe("routing", () => {
    it("dispatches an agent.pi.event to the registered handler with matching tabId and sessionId", () => {
      const onEventA = vi.fn();
      const onEventB = vi.fn();

      const disposeA = registerAgentChatEventRouter({
        tabId: "tab-a",
        sessionId: "session-a",
        onEvent: onEventA,
      });
      const disposeB = registerAgentChatEventRouter({
        tabId: "tab-b",
        sessionId: "session-b",
        onEvent: onEventB,
      });

      const payloadA = {
        sessionId: "session-a",
        tabId: "tab-a",
        workspaceId: "workspace-1",
        event: { type: "agent_start" },
      };

      emitPiEvent(payloadA);

      expect(onEventA).toHaveBeenCalledTimes(1);
      expect(onEventA).toHaveBeenCalledWith(payloadA);
      expect(onEventB).not.toHaveBeenCalled();

      disposeA();
      disposeB();
    });

    it("does not dispatch when sessionId matches but tabId differs", () => {
      const onEvent = vi.fn();
      const dispose = registerAgentChatEventRouter({
        tabId: "tab-a",
        sessionId: "session-a",
        onEvent,
      });

      emitPiEvent({
        sessionId: "session-a",
        tabId: "tab-b",
        workspaceId: "workspace-1",
        event: { type: "agent_start" },
      });

      expect(onEvent).not.toHaveBeenCalled();

      dispose();
    });

    it("does not dispatch when tabId matches but sessionId differs", () => {
      const onEvent = vi.fn();
      const dispose = registerAgentChatEventRouter({
        tabId: "tab-a",
        sessionId: "session-a",
        onEvent,
      });

      emitPiEvent({
        sessionId: "session-b",
        tabId: "tab-a",
        workspaceId: "workspace-1",
        event: { type: "agent_start" },
      });

      expect(onEvent).not.toHaveBeenCalled();

      dispose();
    });

    it("does not dispatch non-agent.pi.event topics", () => {
      const onEvent = vi.fn();
      const dispose = registerAgentChatEventRouter({
        tabId: "tab-a",
        sessionId: "session-a",
        onEvent,
      });

      for (const listener of mocks.rawListeners) {
        listener({
          method: "terminal.output",
          payload: {
            sessionId: "session-a",
            tabId: "tab-a",
            data: "some output",
          },
        });
      }

      expect(onEvent).not.toHaveBeenCalled();

      dispose();
    });

    it("ignores events with malformed or missing payload fields", () => {
      const onEvent = vi.fn();
      const dispose = registerAgentChatEventRouter({
        tabId: "tab-a",
        sessionId: "session-a",
        onEvent,
      });

      for (const listener of mocks.rawListeners) {
        listener({ method: "agent.pi.event", payload: null });
        listener({ method: "agent.pi.event", payload: {} });
        listener({ method: "agent.pi.event", payload: { tabId: "tab-a" } });
        listener({ method: "agent.pi.event", payload: { sessionId: "session-a" } });
      }

      expect(onEvent).not.toHaveBeenCalled();

      dispose();
    });
  });

  describe("disposal", () => {
    it("removes the handler so events no longer dispatch after disposal", () => {
      const onEvent = vi.fn();
      const dispose = registerAgentChatEventRouter({
        tabId: "tab-a",
        sessionId: "session-a",
        onEvent,
      });

      dispose();

      emitPiEvent({
        sessionId: "session-a",
        tabId: "tab-a",
        workspaceId: "workspace-1",
        event: { type: "agent_start" },
      });

      expect(onEvent).not.toHaveBeenCalled();
    });

    it("a stale disposer from a previous registration does not remove a newer registration for the same tabId", () => {
      const onEventOld = vi.fn();
      const onEventNew = vi.fn();

      const disposeOld = registerAgentChatEventRouter({
        tabId: "tab-a",
        sessionId: "session-old",
        onEvent: onEventOld,
      });

      // Replace the registration with a new one (simulates remount/reconnect)
      const disposeNew = registerAgentChatEventRouter({
        tabId: "tab-a",
        sessionId: "session-new",
        onEvent: onEventNew,
      });

      // Dispose the old registration — must not affect the new one
      disposeOld();

      emitPiEvent({
        sessionId: "session-new",
        tabId: "tab-a",
        workspaceId: "workspace-1",
        event: { type: "agent_start" },
      });

      expect(onEventNew).toHaveBeenCalledTimes(1);
      expect(onEventOld).not.toHaveBeenCalled();

      disposeNew();
    });

    it("disposing the only registration also unsubscribes the transport listener", () => {
      const dispose = registerAgentChatEventRouter({
        tabId: "tab-a",
        sessionId: "session-a",
        onEvent: vi.fn(),
      });

      expect(mocks.rawListeners.size).toBe(1);

      dispose();

      expect(mocks.rawListeners.size).toBe(0);
    });

    it("disposing one of multiple registrations keeps the transport listener active", () => {
      const disposeA = registerAgentChatEventRouter({
        tabId: "tab-a",
        sessionId: "session-a",
        onEvent: vi.fn(),
      });
      const disposeB = registerAgentChatEventRouter({
        tabId: "tab-b",
        sessionId: "session-b",
        onEvent: vi.fn(),
      });

      expect(mocks.rawListeners.size).toBe(1);

      disposeA();

      // Transport listener still alive for the remaining registration
      expect(mocks.rawListeners.size).toBe(1);

      disposeB();
    });
  });

  describe("readiness", () => {
    it("resolves ensureAgentChatEventRouterReady only after the transport listener is installed", async () => {
      let installedListener: ((envelope: { method: string; payload: unknown }) => void) | null = null;
      mocks.subscribeDesktopRpcEvent.mockImplementation(
        (listener: (envelope: { method: string; payload: unknown }) => void) => {
          installedListener = listener;
          mocks.rawListeners.add(listener);
          return () => {
            mocks.rawListeners.delete(listener);
          };
        },
      );

      const onEvent = vi.fn();

      const readyPromise = ensureAgentChatEventRouterReady();
      const dispose = registerAgentChatEventRouter({
        tabId: "tab-a",
        sessionId: "session-a",
        onEvent,
      });

      await readyPromise;

      // After readiness resolves, the listener must be installed…
      expect(installedListener).not.toBeNull();

      // …and events must actually route to the registered handler.
      emitPiEvent({
        sessionId: "session-a",
        tabId: "tab-a",
        workspaceId: "workspace-1",
        event: { type: "agent_start" },
      });
      expect(onEvent).toHaveBeenCalledTimes(1);

      dispose();
    });

    it("can be awaited before any registration exists (deferred listener case)", async () => {
      // Calling ensureAgentChatEventRouterReady before any registration should
      // still resolve once the first registration triggers listener creation.
      const onEvent = vi.fn();
      const readyPromise = ensureAgentChatEventRouterReady();

      // Register after the readiness promise is created
      const dispose = registerAgentChatEventRouter({
        tabId: "tab-a",
        sessionId: "session-a",
        onEvent,
      });

      await readyPromise;

      // The listener should now be active
      expect(mocks.rawListeners.size).toBe(1);

      // …and events must actually route.
      emitPiEvent({
        sessionId: "session-a",
        tabId: "tab-a",
        workspaceId: "workspace-1",
        event: { type: "agent_start" },
      });
      expect(onEvent).toHaveBeenCalledTimes(1);

      dispose();
    });
  });
});

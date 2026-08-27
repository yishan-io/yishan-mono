// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { tabStore } from "../../../domains/workbench/state/tabStore";
import { abortAgent, sendAgentPrompt } from "../commands/agentChatCommands";
import { agentChatStore } from "../state/agentChatStore";
import { registerAgentChatEventRouter } from "../subscriptions/agentChatEventRouter";
import type { DSHFrontendPayload } from "../subscriptions/dshTranscript";
import { ensureAgentSession, findTabWithSession, stopAgentSession } from "./agentSessionRuntime";
import { resetDshTestState } from "./agentSessionRuntime.dsh.testSupport";

const mocks = vi.hoisted(() => ({
  startAgent: vi.fn(),
  attachAgent: vi.fn(),
  promptAgent: vi.fn(),
  abortAgent: vi.fn(),
  disposeAgent: vi.fn(),
  send: vi.fn(),
  closeAgentSession: vi.fn(),
  ensureChatSession: vi.fn(),
  listActiveSessions: vi.fn(),
  listDetectionStatuses: vi.fn(),
  listModels: vi.fn(),
  listProviders: vi.fn(),
  removeProvider: vi.fn(),
  rename: vi.fn(),
  runChatPrompt: vi.fn(),
  saveProvider: vi.fn(),
  readHistory: vi.fn(),
  getCapabilities: vi.fn(),
  listSessionLineage: vi.fn(),
  dshEventHandler: null as ((payload: DSHFrontendPayload) => void) | null,
  dshLifecycleHandler: null as (() => void) | null,
}));

vi.mock("@shared/ids/generateId", () => ({
  generateId: vi.fn(() => "generated-session-id"),
}));

vi.mock("../subscriptions/agentChatEventRouter", () => ({
  ensureAgentChatEventRouterReady: vi.fn(() => Promise.resolve()),
  registerAgentChatEventRouter: vi.fn(() => () => {}),
}));

vi.mock("../subscriptions/agentChatDSHEventRouter", () => ({
  registerAgentChatDSHEventRouter: vi.fn(
    (options: {
      onEvent: (payload: DSHFrontendPayload) => void;
      onLifecycleUpdate?: () => void;
    }) => {
      mocks.dshEventHandler = options.onEvent;
      mocks.dshLifecycleHandler = options.onLifecycleUpdate ?? null;
      return () => {};
    },
  ),
}));

vi.mock("../../../domains/agent/daemon/daemonAgentProcedures", () => ({
  subscribeDesktopRpcEvent: vi.fn(() => () => {}),
  readAgentRuntimeHistory: mocks.readHistory,
  getAgentCapabilities: mocks.getCapabilities,
  attachAgentSession: mocks.attachAgent,
  abortAgentSession: mocks.abortAgent,
  disposeAgentSession: mocks.disposeAgent,
  promptAgentSession: mocks.promptAgent,
  startAgentSession: mocks.startAgent,
  closeAgentSession: mocks.closeAgentSession,
  ensureWorkspaceChatSession: mocks.ensureChatSession,
  listActivePiCompatibilitySessions: mocks.listActiveSessions,
  listAgentDetectionStatuses: mocks.listDetectionStatuses,
  listAgentModels: mocks.listModels,
  listAgentSessionLineage: mocks.listSessionLineage,
  listPiProviders: mocks.listProviders,
  removePiProvider: mocks.removeProvider,
  renamePiCompatibilitySession: mocks.rename,
  runWorkspaceChatPrompt: mocks.runChatPrompt,
  savePiProvider: mocks.saveProvider,
  sendPiCompatibilityCommand: mocks.send,
}));

afterEach(() => {
  resetDshTestState();
  mocks.disposeAgent.mockReset();
  vi.clearAllMocks();
});

describe("agentSessionRuntime.DSH", () => {
  it("keeps equal Pi and DSH session ids in distinct tabs", () => {
    tabStore.setState({
      tabs: [
        {
          id: "pi-tab",
          workspaceId: "workspace-1",
          title: "Pi",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/workspace", sessionId: "same-id", runtime: "pi" },
        },
        {
          id: "dsh-tab",
          workspaceId: "workspace-1",
          title: "DSH",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/workspace", sessionId: "same-id", runtime: "dsh" },
        },
      ],
    });

    expect(findTabWithSession("same-id", "pi")).toBe("pi-tab");
    expect(findTabWithSession("same-id", "dsh")).toBe("dsh-tab");
  });

  it("uses neutral DSH lifecycle procedures and never sends Pi controls", async () => {
    mocks.startAgent.mockResolvedValue({ runtime: "dsh", sessionId: "dsh-session" });
    mocks.promptAgent.mockResolvedValue({ runtime: "dsh", ok: true });
    mocks.abortAgent.mockResolvedValue({ runtime: "dsh", ok: true });
    mocks.disposeAgent.mockResolvedValue({ runtime: "dsh", ok: true });

    await ensureAgentSession({
      runtime: "dsh",
      tabId: "tab-dsh",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "dsh-session",
    });
    await sendAgentPrompt({ tabId: "tab-dsh", sessionId: "dsh-session", message: "Hello" });
    await abortAgent({ tabId: "tab-dsh", sessionId: "dsh-session" });
    await stopAgentSession("tab-dsh");

    expect(mocks.startAgent).toHaveBeenCalledWith(expect.objectContaining({ runtime: "dsh" }));
    expect(mocks.promptAgent).toHaveBeenCalledWith(expect.objectContaining({ runtime: "dsh" }));
    expect(mocks.abortAgent).toHaveBeenCalledWith(expect.objectContaining({ runtime: "dsh" }));
    expect(mocks.disposeAgent).toHaveBeenCalledWith(expect.objectContaining({ runtime: "dsh" }));
    expect(mocks.send).not.toHaveBeenCalled();
    expect(registerAgentChatEventRouter).not.toHaveBeenCalled();
  });

  it("omits Pi steering semantics from prompts while DSH is running", async () => {
    mocks.startAgent.mockResolvedValue({ runtime: "dsh", sessionId: "dsh-running" });
    mocks.promptAgent.mockResolvedValue({ runtime: "dsh", ok: true });
    await ensureAgentSession({
      runtime: "dsh",
      tabId: "tab-dsh-running",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "dsh-running",
    });
    agentChatStore.getState().setSessionState("tab-dsh-running", "running");

    await sendAgentPrompt({ tabId: "tab-dsh-running", sessionId: "dsh-running", message: "Steer this" });

    expect(mocks.promptAgent).toHaveBeenCalledWith(
      expect.not.objectContaining({ streamingBehavior: expect.anything() }),
    );
  });

  it("resumes an explicit DSH session without changing Pi start payloads", async () => {
    mocks.startAgent.mockResolvedValue({ runtime: "dsh", sessionId: "dsh-restored-session" });

    await ensureAgentSession({
      runtime: "dsh",
      tabId: "tab-dsh-restored",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "dsh-restored-session",
    });

    expect(mocks.startAgent).toHaveBeenCalledWith({
      runtime: "dsh",
      sessionId: "dsh-restored-session",
      tabId: "tab-dsh-restored",
      paneId: "pane-tab-dsh-restored",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      resume: true,
    });
  });

  it("starts a new DSH session without resume", async () => {
    mocks.startAgent.mockResolvedValue({ runtime: "dsh", sessionId: "generated-session-id" });

    await ensureAgentSession({
      runtime: "dsh",
      tabId: "tab-dsh-new",
      workspaceId: "workspace-1",
      cwd: "/workspace",
    });

    expect(mocks.startAgent).toHaveBeenCalledWith({
      runtime: "dsh",
      sessionId: "generated-session-id",
      tabId: "tab-dsh-new",
      paneId: "pane-tab-dsh-new",
      workspaceId: "workspace-1",
      cwd: "/workspace",
    });
  });

  it("refreshes DSH parent lineage for lifecycle and resync hints without transcript projection", async () => {
    tabStore.setState({
      tabs: [
        {
          id: "dsh-lifecycle-tab",
          workspaceId: "workspace-1",
          title: "DSH",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/workspace", sessionId: "dsh-lifecycle", runtime: "dsh" },
        },
      ],
    });
    mocks.startAgent.mockResolvedValue({ runtime: "dsh", sessionId: "dsh-lifecycle" });
    mocks.listSessionLineage.mockResolvedValue({
      runtime: "dsh",
      rootSessionId: "dsh-lifecycle",
      mode: "children",
      children: [],
    });
    await ensureAgentSession({
      runtime: "dsh",
      tabId: "dsh-lifecycle-tab",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "dsh-lifecycle",
      sessionView: "full",
    });

    mocks.dshLifecycleHandler?.();
    mocks.dshLifecycleHandler?.();

    await vi.waitFor(() => expect(mocks.listSessionLineage).toHaveBeenCalledTimes(2));
    expect(mocks.listSessionLineage).toHaveBeenCalledWith({
      runtime: "dsh",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      rootSessionId: "dsh-lifecycle",
      mode: "children",
    });
    expect(agentChatStore.getState().sessionsByTabId["dsh-lifecycle-tab"]?.messages).toEqual([]);
  });
  it("does not refresh lineage from a DSH child-detail lifecycle hint", async () => {
    tabStore.setState({
      tabs: [
        {
          id: "dsh-detail-tab",
          workspaceId: "workspace-1",
          title: "DSH child",
          pinned: false,
          kind: "agent-chat",
          data: { cwd: "/workspace", sessionId: "dsh-child", runtime: "dsh" },
        },
      ],
    });
    mocks.startAgent.mockResolvedValue({ runtime: "dsh", sessionId: "dsh-child" });
    await ensureAgentSession({
      runtime: "dsh",
      tabId: "dsh-detail-tab",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "dsh-child",
      sessionView: "subagent-detail",
    });

    mocks.dshLifecycleHandler?.();
    await Promise.resolve();

    expect(mocks.listSessionLineage).not.toHaveBeenCalled();
  });
  it("does not block a DSH reopen on an equal-ID Pi close", async () => {
    mocks.startAgent.mockResolvedValue({ runtime: "pi", sessionId: "same-id" });
    await ensureAgentSession({
      runtime: "pi",
      tabId: "pi-close-tab",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "same-id",
    });

    let resolvePiDispose: (() => void) | undefined;
    mocks.disposeAgent.mockImplementation(({ runtime }: { runtime: string }) =>
      runtime === "pi"
        ? new Promise<void>((resolve) => {
            resolvePiDispose = resolve;
          })
        : Promise.resolve({ runtime: "dsh", ok: true }),
    );
    const closePromise = stopAgentSession("pi-close-tab");
    await vi.waitFor(() => expect(mocks.disposeAgent).toHaveBeenCalledWith(expect.objectContaining({ runtime: "pi" })));

    const dshOpenPromise = ensureAgentSession({
      runtime: "dsh",
      tabId: "dsh-open-tab",
      workspaceId: "workspace-1",
      cwd: "/workspace",
      sessionId: "same-id",
    });
    await expect(dshOpenPromise).resolves.toMatchObject({ runtime: "dsh", sessionId: "same-id" });
    expect(mocks.startAgent).toHaveBeenLastCalledWith(expect.objectContaining({ runtime: "dsh" }));

    resolvePiDispose?.();
    await closePromise;
    await stopAgentSession("dsh-open-tab");
  });
});

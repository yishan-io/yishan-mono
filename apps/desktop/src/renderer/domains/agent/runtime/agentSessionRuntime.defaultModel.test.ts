// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { splitPaneStore } from "../../../domains/workbench/state/splitPaneStore";
import { tabStore } from "../../../domains/workbench/state/tabStore";
import { agentChatStore } from "../state/agentChatStore";
import { agentSettingsStore } from "../state/agentSettingsStore";
import { clearPiSessionHandle, ensurePiSession } from "./agentSessionRuntime";

const initialAgentChatStoreState = agentChatStore.getState();
const initialTabStoreState = tabStore.getState();
const initialSplitPaneStoreState = splitPaneStore.getState();

const mocks = vi.hoisted(() => ({
  start: vi.fn(),
  attach: vi.fn(),
  stop: vi.fn(),
  send: vi.fn(),
  listSessions: vi.fn(),
  listActiveSessions: vi.fn(),
  getSessionFile: vi.fn(),
  listModels: vi.fn(),
  listProviders: vi.fn(),
  removeProvider: vi.fn(),
  rename: vi.fn(),
  runChatPrompt: vi.fn(),
  saveProvider: vi.fn(),
  closeAgentSession: vi.fn(),
  ensureChatSession: vi.fn(),
  getDetectionStatuses: vi.fn(),
  listDetectionStatuses: vi.fn(),
}));

vi.mock("@shared/ids/generateId", () => ({
  generateId: vi.fn(() => "generated-session-id"),
}));

vi.mock("../subscriptions/agentChatEventRouter", () => ({
  ensureAgentChatEventRouterReady: vi.fn(() => Promise.resolve()),
  registerAgentChatEventRouter: vi.fn(() => () => {}),
}));

vi.mock("../../../domains/agent/daemon/daemonAgentProcedures", () => ({
  attachPiSession: mocks.attach,
  closeAgentSession: mocks.closeAgentSession ?? vi.fn(),
  ensureWorkspaceChatSession: mocks.ensureChatSession ?? vi.fn(),
  getPiSessionFile: mocks.getSessionFile ?? vi.fn(),
  listActivePiSessions: mocks.listActiveSessions ?? vi.fn(),
  listAgentDetectionStatuses: mocks.listDetectionStatuses ?? vi.fn(),
  listAgentModels: mocks.listModels ?? vi.fn(),
  listPiProviders: mocks.listProviders ?? vi.fn(),
  listPiSessions: mocks.listSessions ?? vi.fn(),
  removePiProvider: mocks.removeProvider ?? vi.fn(),
  renamePiSession: mocks.rename ?? vi.fn(),
  runWorkspaceChatPrompt: mocks.runChatPrompt ?? vi.fn(),
  savePiProvider: mocks.saveProvider ?? vi.fn(),
  sendPiCommand: mocks.send ?? vi.fn(),
  startPiSession: mocks.start ?? vi.fn(),
  stopPiSession: mocks.stop ?? vi.fn(),
}));

afterEach(() => {
  agentChatStore.setState(initialAgentChatStoreState, true);
  tabStore.setState(initialTabStoreState, true);
  splitPaneStore.setState(initialSplitPaneStoreState, true);
  mocks.stop.mockReset();
  agentSettingsStore.setState({ defaultModel: undefined });
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
describe("desktop default model startup", () => {
  it("waits for preference hydration before fresh startup and preserves the model identity", async () => {
    let finishHydration: (() => void) | undefined;
    vi.spyOn(agentSettingsStore.persist, "hasHydrated").mockReturnValue(false);
    vi.spyOn(agentSettingsStore.persist, "rehydrate").mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishHydration = () => {
            agentSettingsStore.setState({
              defaultModel: { provider: "openrouter", modelId: "anthropic/claude-sonnet-4" },
            });
            resolve();
          };
        }),
    );
    mocks.start.mockResolvedValue({ sessionId: "generated-session-id" });
    const startup = ensurePiSession({ tabId: "default-fresh", workspaceId: "ws", cwd: "/tmp" });
    await vi.waitFor(() => expect(finishHydration).toBeDefined());
    expect(mocks.start).not.toHaveBeenCalled();
    finishHydration?.();
    await startup;
    expect(mocks.start).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openrouter",
        modelId: "anthropic/claude-sonnet-4",
      }),
    );
    clearPiSessionHandle("default-fresh");
  });

  it.each([undefined, "history-session"])("does not override native defaults or history: %s", async (sessionId) => {
    agentSettingsStore.setState({ defaultModel: sessionId ? { provider: "openai", modelId: "gpt-5" } : undefined });
    mocks.start.mockResolvedValue({ sessionId: sessionId ?? "generated-session-id" });
    await ensurePiSession({ tabId: "default-no-override", workspaceId: "ws", cwd: "/tmp", sessionId });
    const input = mocks.start.mock.calls[0]?.[0];
    expect(input).not.toHaveProperty("provider");
    expect(input).not.toHaveProperty("modelId");
    expect(input.resume).toBeUndefined();
    clearPiSessionHandle("default-no-override");
  });
});

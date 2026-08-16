// @vitest-environment jsdom

import { vi } from "vitest";

type MockedCommands = {
  createWorkspace: ReturnType<typeof vi.fn>;
  renameWorkspace: ReturnType<typeof vi.fn>;
  renameWorkspaceBranch: ReturnType<typeof vi.fn>;
  getGitAuthorName: ReturnType<typeof vi.fn>;
  listGitBranches: ReturnType<typeof vi.fn>;
  listAgentModels: ReturnType<typeof vi.fn>;
  listNodesByOrg: ReturnType<typeof vi.fn>;
};

// biome-ignore lint/style/noVar: var hoisting is required for vi.mock factory
var mocked: MockedCommands | undefined;

export function getMockedCommands(): MockedCommands {
  if (mocked) {
    return mocked;
  }

  mocked = {
    createWorkspace: vi.fn(),
    renameWorkspace: vi.fn(),
    renameWorkspaceBranch: vi.fn(),
    getGitAuthorName: vi.fn(),
    listGitBranches: vi.fn(),
    listAgentModels: vi.fn(),
    listNodesByOrg: vi.fn(),
  };

  return mocked;
}

export function resetMockedCommands() {
  mocked = undefined;
}

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, i) => ({
        index: i,
        key: `virtual-${i}`,
        start: i * 36,
        size: 36,
      })),
    getTotalSize: () => count * 36,
    scrollToIndex: () => {},
    measureElement: () => {},
  }),
}));

vi.mock("../../../hooks/useCommands", () => {
  const commandSurface = () => ({

    createWorkspace: getMockedCommands().createWorkspace,
    renameWorkspace: getMockedCommands().renameWorkspace,
    renameWorkspaceBranch: getMockedCommands().renameWorkspaceBranch,
    getGitAuthorName: getMockedCommands().getGitAuthorName,
    listGitBranches: getMockedCommands().listGitBranches,
    listAgentModels: getMockedCommands().listAgentModels,
  });
  return {
    useAppCommands: commandSurface,
    useSessionCommands: commandSurface,
    useWorkspaceCommands: commandSurface,
    useAgentCommands: commandSurface,
    useGitCommands: commandSurface,
    useNodeCommands: commandSurface,
    useNotificationCommands: commandSurface,
    useOrganizationCommands: commandSurface,
    useOverviewCommands: commandSurface,
    useScheduledJobCommands: commandSurface,
    useFileCommands: commandSurface,
    useProjectCommands: commandSurface,
    useWorkbenchCommands: commandSurface,
    useTerminalCommands: commandSurface,
    useSettingsCommands: commandSurface,
  };
});


vi.mock("../../../api", () => ({
  api: {
    node: {
      listByOrg: getMockedCommands().listNodesByOrg,
    },
  },
}));

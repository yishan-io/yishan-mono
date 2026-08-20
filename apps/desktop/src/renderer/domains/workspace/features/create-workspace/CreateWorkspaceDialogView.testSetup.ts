// @vitest-environment jsdom

import { vi } from "vitest";
import { workspaceSettingsStore } from "../../state/workspaceSettingsStore";

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

vi.mock("../../commands/workspaceCommands", () => ({
  get createWorkspace() {
    return getMockedCommands().createWorkspace;
  },
  get renameWorkspace() {
    return getMockedCommands().renameWorkspace;
  },
  get renameWorkspaceBranch() {
    return getMockedCommands().renameWorkspaceBranch;
  },
}));

vi.mock("@renderer/domains/workspace", async () => {
  const { workspaceSettingsStore } = await import("../../state/workspaceSettingsStore");
  const { useWorkspaceBranchPrefixSettings } = await import("../../hooks/useWorkspaceBranchPrefixSettings");
  const { resolveGitBranchPrefix } = await import("../../naming/branchPrefix");
  return {
    workspaceSettingsStore,
    useWorkspaceBranchPrefixSettings,
    resolveGitBranchPrefix,
    get createWorkspace() {
      return getMockedCommands().createWorkspace;
    },
    get renameWorkspace() {
      return getMockedCommands().renameWorkspace;
    },
    get renameWorkspaceBranch() {
      return getMockedCommands().renameWorkspaceBranch;
    },
  };
});

vi.mock("@renderer/domains/git", async () => {
  const { useEffect, useState } = await import("react");
  return {
    get listGitBranches() {
      return getMockedCommands().listGitBranches;
    },
    get getGitAuthorName() {
      return getMockedCommands().getGitAuthorName;
    },
    useGitAuthorName: (worktreePath: string) => {
      const [name, setName] = useState("");
      useEffect(() => {
        if (!worktreePath) {
          setName("");
          return;
        }
        let cancelled = false;
        const fetchAuthorName = getMockedCommands().getGitAuthorName as unknown as (input: {
          workspaceId: string;
        }) => Promise<string | null | undefined>;
        void fetchAuthorName({
          workspaceId: worktreePath === "/tmp/repo-1" ? "workspace-author-1" : "workspace-1",
        })
          .then((author: string | null | undefined) => {
            if (!cancelled) setName(author?.trim() ?? "");
          })
          .catch(() => {
            if (!cancelled) setName("");
          });
        return () => {
          cancelled = true;
        };
      }, [worktreePath]);
      return name;
    },
  };
});

vi.mock("@renderer/domains/agent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@renderer/domains/agent")>();
  return {
    ...actual,
    get listAgentModels() {
      return getMockedCommands().listAgentModels;
    },
  };
});

vi.mock("../../../../api", () => ({
  api: {
    node: {
      listByOrg: getMockedCommands().listNodesByOrg,
    },
  },
}));

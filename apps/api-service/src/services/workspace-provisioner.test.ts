import { RelayRequestFailedError, RelayUnavailableError } from "@/errors";
import { invokeRelayJsonRpc } from "@/lib/relay-client";
import { RelayWorkspaceProvisioner } from "@/services/workspace-provisioner";
import type { ServiceConfig } from "@/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/relay-client", () => ({
  invokeRelayJsonRpc: vi.fn(),
}));

const invokeRelayJsonRpcMock = vi.mocked(invokeRelayJsonRpc);
const relayConfig = {
  relayApiToken: "relay-token",
  relayUrl: "wss://relay.test",
} as ServiceConfig;

describe("RelayWorkspaceProvisioner", () => {
  beforeEach(() => {
    invokeRelayJsonRpcMock.mockReset();
  });

  it("accepts async relay create responses without a worktree path", async () => {
    invokeRelayJsonRpcMock.mockResolvedValue({
      id: "ws-1",
      status: "pending",
    });
    const provisioner = new RelayWorkspaceProvisioner(relayConfig);

    await expect(
      provisioner.enqueueWorkspaceProvision({
        branch: "feature/test",
        contextEnabled: true,
        kind: "worktree",
        localPath: "",
        nodeId: "node-1",
        organizationId: "org-1",
        projectId: "proj-1",
        repoKey: "owner/repo",
        setupHook: "",
        sourceBranch: "main",
        workspaceId: "ws-1",
        workspaceName: "feature/test",
      }),
    ).resolves.toEqual({
      localPath: "",
    });
  });

  it("keeps returning the relay worktree path when one is provided", async () => {
    invokeRelayJsonRpcMock.mockResolvedValue({
      id: "ws-1",
      status: "active",
      worktreePath: "/tmp/worktree",
    });
    const provisioner = new RelayWorkspaceProvisioner(relayConfig);

    await expect(
      provisioner.enqueueWorkspaceProvision({
        branch: "feature/test",
        contextEnabled: true,
        kind: "worktree",
        localPath: "",
        nodeId: "node-1",
        organizationId: "org-1",
        projectId: "proj-1",
        repoKey: "owner/repo",
        setupHook: "",
        sourceBranch: "main",
        workspaceId: "ws-1",
        workspaceName: "feature/test",
      }),
    ).resolves.toEqual({
      localPath: "/tmp/worktree",
    });
  });

  it("fails when relay is not configured", async () => {
    const provisioner = new RelayWorkspaceProvisioner({} as ServiceConfig);

    await expect(
      provisioner.enqueueWorkspaceProvision({
        branch: "feature/test",
        contextEnabled: true,
        kind: "worktree",
        localPath: "",
        nodeId: "node-1",
        organizationId: "org-1",
        projectId: "proj-1",
        repoKey: "owner/repo",
        setupHook: "",
        sourceBranch: "main",
        workspaceId: "ws-1",
        workspaceName: "feature/test",
      }),
    ).rejects.toBeInstanceOf(RelayUnavailableError);
  });

  it("wraps unexpected relay failures", async () => {
    invokeRelayJsonRpcMock.mockRejectedValue(new Error("boom"));
    const provisioner = new RelayWorkspaceProvisioner(relayConfig);

    await expect(
      provisioner.enqueueWorkspaceProvision({
        branch: "feature/test",
        contextEnabled: true,
        kind: "worktree",
        localPath: "",
        nodeId: "node-1",
        organizationId: "org-1",
        projectId: "proj-1",
        repoKey: "owner/repo",
        setupHook: "",
        sourceBranch: "main",
        workspaceId: "ws-1",
        workspaceName: "feature/test",
      }),
    ).rejects.toBeInstanceOf(RelayRequestFailedError);
  });
});

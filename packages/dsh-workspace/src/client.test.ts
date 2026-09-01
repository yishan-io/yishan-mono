import type { CapabilityIdentity, CapabilityTransport } from "@yishan-io/dsh-daemon-bridge";
import { describe, expect, it, vi } from "vitest";

import { type WorkspaceCapabilityRequest, WorkspaceClient } from "./client";

const identity: CapabilityIdentity = {
  sessionId: "session-1",
  workspaceId: "workspace-1",
  generation: 2,
};

describe("WorkspaceClient", () => {
  it("delegates workspace operations through the base capability client", async () => {
    const transport: CapabilityTransport<WorkspaceCapabilityRequest> = {
      requestCapability: vi.fn(async (request) => {
        switch (request.operation) {
          case "workspace.list":
            return { workspaces: [] };
          case "workspace.find":
            return { workspace: { id: "workspace-2" } };
          case "workspace.create":
            return { workspaceId: "workspace-2", stdout: "" };
          case "workspace.close":
            return { workspace: { id: "workspace-2" } };
        }
      }),
    };
    const client = new WorkspaceClient(transport, identity, new AbortController().signal);

    await client.list({});
    await client.find({ workspaceId: "workspace-2" });
    await client.create({ projectId: "project-1", branch: "feature/two" });
    await client.close({ workspaceId: "workspace-2" });

    expect(getRequests(transport)).toMatchObject([
      { ...identity, operation: "workspace.list", input: {} },
      { ...identity, operation: "workspace.find", input: { workspaceId: "workspace-2" } },
      { ...identity, operation: "workspace.create", input: { projectId: "project-1", branch: "feature/two" } },
      { ...identity, operation: "workspace.close", input: { workspaceId: "workspace-2" } },
    ]);
  });

  it("rejects malformed daemon results at the domain boundary", async () => {
    const client = new WorkspaceClient(
      createTransport({ workspaces: "invalid" }),
      identity,
      new AbortController().signal,
    );
    await expect(client.list({})).rejects.toThrow();
  });
});

function createTransport(response: unknown): CapabilityTransport<WorkspaceCapabilityRequest> {
  return { requestCapability: vi.fn(async () => response) };
}

function getRequests(transport: CapabilityTransport<WorkspaceCapabilityRequest>): WorkspaceCapabilityRequest[] {
  return vi.mocked(transport.requestCapability).mock.calls.map(([request]) => request);
}

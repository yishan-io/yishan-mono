import { describe, expect, it, vi } from "vitest";

import {
  WorkspaceCapabilityClient,
  type WorkspaceCapabilityIdentity,
  type WorkspaceCapabilityRequest,
  type WorkspaceCapabilityTransport,
  createWorkspaceClientResolver,
} from "./workspace";

const identity: WorkspaceCapabilityIdentity = {
  sessionId: "session-1",
  workspaceId: "workspace-1",
  generation: 2,
};

describe("WorkspaceCapabilityClient", () => {
  it("delegates workspace operations through the generic capability client", async () => {
    const transport = createTransport({ workspaces: [] });
    const client = new WorkspaceCapabilityClient(transport, identity, new AbortController().signal);

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

  it("resolves a concrete client with the fixed identity for the execution session", async () => {
    const transport = createTransport({ workspaces: [] });
    const resolveIdentity = vi.fn(() => identity);
    const resolver = createWorkspaceClientResolver(transport, resolveIdentity);
    const client = resolver({ agent: { id: "session-1" }, signal: new AbortController().signal });

    await expect(client.list({ projectId: "project-1" })).resolves.toEqual({ workspaces: [] });

    expect(client).toBeInstanceOf(WorkspaceCapabilityClient);
    expect(resolveIdentity).toHaveBeenCalledWith("session-1");
    expect(getOnlyRequest(transport)).toMatchObject({ operation: "workspace.list", input: { projectId: "project-1" } });
  });

  it("rejects executions without an agent-scoped session", () => {
    const resolver = createWorkspaceClientResolver(createTransport({ workspaces: [] }), () => identity);

    expect(() => resolver({ signal: new AbortController().signal })).toThrow(
      "workspace tools require an agent-scoped execution",
    );
  });
});

function createTransport(response: unknown): WorkspaceCapabilityTransport {
  return { requestWorkspaceCapability: vi.fn(async () => response) };
}

function getOnlyRequest(transport: WorkspaceCapabilityTransport): WorkspaceCapabilityRequest {
  const requests = vi.mocked(transport.requestWorkspaceCapability).mock.calls;
  const request = requests[0]?.[0];
  if (request === undefined) throw new Error("expected one workspace capability request");
  expect(requests).toHaveLength(1);
  return request;
}

function getRequests(transport: WorkspaceCapabilityTransport): WorkspaceCapabilityRequest[] {
  return vi.mocked(transport.requestWorkspaceCapability).mock.calls.map(([request]) => request);
}

import { Context } from "@deepseek-ai/cordis";
import { describe, expect, it } from "vitest";

import { WorkspaceBindingHost, type WorkspaceBindingSource } from "./workspaceBinding";

const identity = { sessionId: "session-1", workspaceId: "workspace-1", cwd: "/workspace" };

function createBridge(response = createWorkspaceBinding()): WorkspaceBindingSource {
  return { resolveWorkspaceBinding: async () => response };
}

function createWorkspaceBinding() {
  return {
    workspaceId: "workspace-1",
    cwd: "/workspace",
    generation: 1,
    policy: { authorization: "daemon-authorized" as const },
  };
}

describe("workspace binding", () => {
  it("adopts daemon-authoritative facts and resolves the session capability identity", async () => {
    const context = new Context();
    new WorkspaceBindingHost(context, createBridge());
    const host = context.yishanWorkspaceBindingHost;

    await expect(host.resolveSessionBinding(identity)).resolves.toMatchObject({ cwd: "/workspace" });
    expect(host.resolveWorkspaceCapabilityIdentity(identity.sessionId)).toEqual({
      sessionId: "session-1",
      workspaceId: "workspace-1",
      generation: 1,
    });
  });

  it("rejects an binding whose daemon response changes the session cwd", async () => {
    const context = new Context();
    new WorkspaceBindingHost(context, createBridge({ ...createWorkspaceBinding(), cwd: "/other" }));

    await expect(context.yishanWorkspaceBindingHost.resolveSessionBinding(identity)).rejects.toThrow(
      "daemon workspace binding returned a different workspace cwd",
    );
  });

  it("releases the context when its session is disposed", async () => {
    const context = new Context();
    new WorkspaceBindingHost(context, createBridge());
    const host: WorkspaceBindingHost = context.yishanWorkspaceBindingHost;
    await host.resolveSessionBinding(identity);

    host.releaseSession(identity.sessionId);
    expect(() => host.getSessionBinding(identity.sessionId)).toThrow("workspace capability is not authorized");
  });
});

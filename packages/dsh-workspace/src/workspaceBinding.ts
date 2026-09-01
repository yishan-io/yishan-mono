import { type Context, Service } from "@deepseek-ai/cordis";
import type { AgentSetup } from "@deepseek-ai/dsh-agent";
import type {
  CapabilityIdentity,
  WorkspaceBinding as DaemonWorkspaceBinding,
  WorkspaceBindingRequest,
} from "@yishan-io/dsh-daemon-bridge";

/** The workspace binding policy currently accepted from the daemon host bridge. */
export type WorkspaceBindingPolicy = DaemonWorkspaceBinding["policy"];
/** Daemon-authorized workspace facts supplied by the Cordis host for an agent setup. */
export type WorkspaceBinding = DaemonWorkspaceBinding;
/** Session identity supplied by the runtime for host-owned binding validation. */
export type WorkspaceBindingIdentity = WorkspaceBindingRequest & { cwd: string };
/** Typed bridge operation used to resolve daemon-authorized workspace facts. */
export type WorkspaceBindingSource = {
  resolveWorkspaceBinding(request: WorkspaceBindingRequest): Promise<WorkspaceBinding>;
};
/** Workspace binding result used to create an agent-scoped setup. */
export type WorkspaceBindingSetup = { cwd: string; setup: AgentSetup };
/** Workspace facts available to DSH services scoped to one agent session. */
export type WorkspaceSessionBinding = WorkspaceBinding & { sessionId: string };

declare module "@deepseek-ai/cordis" {
  interface Context {
    yishanWorkspaceBindingHost: WorkspaceBindingHost;
    yishanWorkspaceBinding: WorkspaceBindingService;
  }
}

/** Provides immutable daemon-authorized workspace facts within one agent scope. */
export class WorkspaceBindingService extends Service {
  /** Creates the agent-scoped workspace binding service. */
  constructor(
    context: Context,
    /** The immutable workspace binding exposed to DSH compositions. */ public readonly workspaceBinding: WorkspaceSessionBinding,
  ) {
    super(context, "yishanWorkspaceBinding");
  }
}

/** Owns workspace binding resolution and scoped DSH composition for one runtime. */
export class WorkspaceBindingHost extends Service {
  private readonly workspaceBindingResolver: WorkspaceBindingSource;
  private readonly sessionIdentities = new Map<string, WorkspaceBindingIdentity>();
  private readonly sessionBindings = new Map<string, WorkspaceSessionBinding>();

  /** Registers the workspace host service in the runtime composition. */
  constructor(context: Context, workspaceBindingResolver: WorkspaceBindingSource) {
    super(context, "yishanWorkspaceBindingHost");
    this.workspaceBindingResolver = workspaceBindingResolver;
  }
  /** Resolves one session binding with the daemon and prepares its scoped agent setup. */
  async resolveSessionBinding(
    identity: WorkspaceBindingIdentity,
    requestedWorkspaceId: string = identity.workspaceId,
  ): Promise<WorkspaceBindingSetup> {
    const admittedRequest = parseWorkspaceBindingRequest(identity);
    if (requestedWorkspaceId !== admittedRequest.workspaceId)
      throw new Error("session does not belong to the requested workspace");
    const existing = this.sessionIdentities.get(admittedRequest.sessionId);
    if (
      existing !== undefined &&
      (existing.workspaceId !== admittedRequest.workspaceId || existing.cwd !== identity.cwd)
    )
      throw new Error("session workspace identity conflicts with its existing binding");
    const workspace = await this.workspaceBindingResolver.resolveWorkspaceBinding(admittedRequest);
    if (workspace.workspaceId !== admittedRequest.workspaceId)
      throw new Error("daemon workspace binding returned a different workspace identity");
    if (workspace.cwd !== identity.cwd) throw new Error("daemon workspace binding returned a different workspace cwd");
    this.sessionIdentities.set(admittedRequest.sessionId, { ...identity });
    this.sessionBindings.set(admittedRequest.sessionId, { sessionId: admittedRequest.sessionId, ...workspace });
    return { cwd: workspace.cwd, setup: this.createAgentSetup(workspace) };
  }
  /** Verifies a live session against the plugin-owned workspace identity. */
  assertSessionWorkspace(sessionId: string, workspaceId: string): void {
    const identity = this.sessionIdentities.get(sessionId);
    if (identity === undefined || identity.workspaceId !== workspaceId)
      throw new Error("session does not belong to the requested workspace");
  }
  /** Gets immutable context bound to the calling agent session. */
  getSessionBinding(sessionId: string): WorkspaceSessionBinding {
    const workspaceBinding = this.sessionBindings.get(sessionId);
    if (workspaceBinding === undefined) throw new Error("workspace capability is not authorized for this session");
    return workspaceBinding;
  }
  /** Resolves the daemon-authorized workspace identity for an admitted session. */
  resolveCapabilityIdentity(sessionId: string): CapabilityIdentity {
    const identity = this.sessionIdentities.get(sessionId);
    const workspaceBinding = this.sessionBindings.get(sessionId);
    if (identity === undefined || workspaceBinding === undefined)
      throw new Error("workspace capability is not authorized for this session");
    return {
      sessionId: identity.sessionId,
      workspaceId: workspaceBinding.workspaceId,
      generation: workspaceBinding.generation,
    };
  }
  /** Releases a disposed session identity. */
  releaseSession(sessionId: string): void {
    this.sessionIdentities.delete(sessionId);
    this.sessionBindings.delete(sessionId);
  }
  /** Creates setup that binds one daemon-authorized workspace to one DSH agent scope. */
  createAgentSetup(workspace: WorkspaceBinding): AgentSetup {
    return (agentContext) => {
      const agent = agentContext.agent;
      if (agent === undefined || agent.session.header.cwd !== workspace.cwd)
        throw new Error("workspace binding does not match the session cwd");
      new WorkspaceBindingService(agentContext, { ...workspace, sessionId: agent.id });
    };
  }
}
function parseWorkspaceBindingRequest(request: WorkspaceBindingRequest): WorkspaceBindingRequest {
  if (request.sessionId.length === 0 || request.workspaceId.length === 0)
    throw new TypeError("workspace session and workspace identity are required");
  return { sessionId: request.sessionId, workspaceId: request.workspaceId };
}

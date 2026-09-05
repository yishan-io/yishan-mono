import {
  CapabilityClient,
  type CapabilityIdentity,
  type CapabilityRequest,
  type CapabilityTransport,
} from "@yishan-io/dsh-daemon-bridge";
import { z } from "zod";

const workspaceRecordSchema = z.object({
  id: z.string(),
  organizationId: z.string().optional(),
  projectId: z.string().optional(),
  nodeId: z.string().optional(),
  kind: z.string().optional(),
  status: z.string().optional(),
  branch: z.string().optional(),
  sourceBranch: z.string().optional(),
  localPath: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

const workspaceListInputSchema = z.object({ projectId: z.string().optional(), orgId: z.string().optional() });
const workspaceListResultSchema = z.object({ workspaces: z.array(workspaceRecordSchema) });
const workspaceFindInputSchema = z.object({
  projectId: z.string().optional(),
  workspaceId: z.string().optional(),
  orgId: z.string().optional(),
});
const workspaceFindResultSchema = z.object({
  workspace: workspaceRecordSchema,
  organizationId: z.string().optional(),
  projectId: z.string().optional(),
});
const workspaceCreateInputSchema = z.object({
  projectId: z.string().optional(),
  orgId: z.string().optional(),
  branch: z.string(),
  sourceBranch: z.string().optional(),
  name: z.string().optional(),
  targetNode: z.string().optional(),
  taskRunPrompt: z.string().optional(),
  taskRunModel: z.string().optional(),
});
const workspaceCreateResultSchema = z.object({
  workspaceId: z.string(),
  localPath: z.string().optional(),
  stdout: z.string(),
});
const workspaceCloseInputSchema = workspaceFindInputSchema;
const workspaceCloseResultSchema = z.object({ workspace: workspaceRecordSchema });

export type WorkspaceRecord = z.infer<typeof workspaceRecordSchema>;
export type WorkspaceListInput = z.infer<typeof workspaceListInputSchema>;
export type WorkspaceListResult = z.infer<typeof workspaceListResultSchema>;
export type WorkspaceFindInput = z.infer<typeof workspaceFindInputSchema>;
export type WorkspaceFindResult = z.infer<typeof workspaceFindResultSchema>;
export type WorkspaceCreateInput = z.infer<typeof workspaceCreateInputSchema>;
export type WorkspaceCreateResult = z.infer<typeof workspaceCreateResultSchema>;
export type WorkspaceCloseInput = z.infer<typeof workspaceCloseInputSchema>;
export type WorkspaceCloseResult = z.infer<typeof workspaceCloseResultSchema>;

type WorkspaceCapabilityOperation = "workspace.list" | "workspace.find" | "workspace.create" | "workspace.close";
type WorkspaceCapabilityInput = WorkspaceListInput | WorkspaceFindInput | WorkspaceCreateInput | WorkspaceCloseInput;
export type WorkspaceCapabilityRequest = CapabilityRequest<WorkspaceCapabilityOperation, WorkspaceCapabilityInput>;

/** Sends workspace lifecycle operations through the base daemon capability client. */
export class WorkspaceClient {
  private readonly client: CapabilityClient<WorkspaceCapabilityOperation, WorkspaceCapabilityInput>;

  constructor(
    transport: CapabilityTransport<WorkspaceCapabilityRequest>,
    identity: CapabilityIdentity,
    signal: AbortSignal,
  ) {
    this.client = new CapabilityClient(transport, identity, signal, "workspace");
  }

  async list(input: WorkspaceListInput): Promise<WorkspaceListResult> {
    return workspaceListResultSchema.parse(
      await this.client.request("workspace.list", workspaceListInputSchema.parse(input)),
    );
  }

  async find(input: WorkspaceFindInput): Promise<WorkspaceFindResult> {
    return workspaceFindResultSchema.parse(
      await this.client.request("workspace.find", workspaceFindInputSchema.parse(input)),
    );
  }

  async create(input: WorkspaceCreateInput): Promise<WorkspaceCreateResult> {
    return workspaceCreateResultSchema.parse(
      await this.client.request("workspace.create", workspaceCreateInputSchema.parse(input)),
    );
  }

  async close(input: WorkspaceCloseInput): Promise<WorkspaceCloseResult> {
    return workspaceCloseResultSchema.parse(
      await this.client.request("workspace.close", workspaceCloseInputSchema.parse(input)),
    );
  }
}

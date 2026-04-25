import type { WorkspaceView } from "@/services/workspace-service";

export type WorkspaceProvisionRequest = {
  workspace: WorkspaceView;
  actorUserId: string;
};

export interface WorkspaceProvisioner {
  enqueueWorkspaceProvision(request: WorkspaceProvisionRequest): Promise<void>;
}

export class NoopWorkspaceProvisioner implements WorkspaceProvisioner {
  async enqueueWorkspaceProvision(_request: WorkspaceProvisionRequest): Promise<void> {
    return;
  }
}

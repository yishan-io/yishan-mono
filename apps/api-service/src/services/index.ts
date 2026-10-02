import type { AppDb } from "@/db/client";
import { AuthService } from "@/services/auth-service";
import { NodeScheduledJobRunService } from "@/services/node-scheduled-job-run-service";
import { NodeScheduledJobService } from "@/services/node-scheduled-job-service";
import { NodeService } from "@/services/node-service";
import { OrganizationExportService } from "@/services/organization-export-service";
import { OrganizationInviteService } from "@/services/organization-invite-service";
import { OrganizationService } from "@/services/organization-service";
import { OverviewService } from "@/services/overview-service";
import { ProjectService } from "@/services/project-service";
import { RelayEventService } from "@/services/relay-event-service";
import { ResendEmailService } from "@/services/resend-email-service";
import { ScheduledJobService } from "@/services/scheduled-job-service";
import { ServiceTokenService } from "@/services/service-token-service";
import { TokenUsageService } from "@/services/token-usage-service";
import { UserService } from "@/services/user-service";
import { VoiceTranscriptionService } from "@/services/voice-transcription-service";
import { NoopWorkspaceProvisioner } from "@/services/workspace-provisioner";
import { WorkspacePullRequestService } from "@/services/workspace-pull-request-service";
import { WorkspaceService } from "@/services/workspace-service";
import type { ServiceConfig } from "@/types";

export type AppServices = {
  user: UserService;
  auth: AuthService;
  organization: OrganizationService;
  organizationInvite: OrganizationInviteService;
  organizationExport: OrganizationExportService;
  node: NodeService;
  nodeScheduledJob: NodeScheduledJobService;
  nodeScheduledJobRun: NodeScheduledJobRunService;
  project: ProjectService;
  relayEvent: RelayEventService;
  scheduledJob: ScheduledJobService;
  workspace: WorkspaceService;
  workspacePullRequest: WorkspacePullRequestService;
  voiceTranscription: VoiceTranscriptionService;
  serviceToken: ServiceTokenService;
  tokenUsage: TokenUsageService;
  overview: OverviewService;
};

export function createServices(deps: { db: AppDb; config: ServiceConfig }): AppServices {
  const emailService = new ResendEmailService(deps.config.resendApiKey, deps.config.resendFromEmail);
  const user = new UserService(deps.db);
  const organizationInvite = new OrganizationInviteService(deps.db, emailService, deps.config.landingBaseUrl);
  const organization = new OrganizationService(deps.db, user, organizationInvite);
  const workspaceProvisioner = new NoopWorkspaceProvisioner();
  const relayEvent = new RelayEventService(deps.config);

  // Wire invite acceptance into user creation so that when a user registers,
  // their pending invitations are automatically accepted.
  user.setInviteService(organizationInvite);

  return {
    user,
    auth: new AuthService(deps.db, deps.config, user),
    organization,
    organizationInvite,
    organizationExport: new OrganizationExportService(deps.db, organization),
    node: new NodeService(deps.db, organization, deps.config),
    nodeScheduledJob: new NodeScheduledJobService(deps.db, organization),
    nodeScheduledJobRun: new NodeScheduledJobRunService(deps.db, organization),
    project: new ProjectService(deps.db, organization),
    relayEvent,
    scheduledJob: new ScheduledJobService(deps.db, organization),
    workspace: new WorkspaceService(deps.db, organization, workspaceProvisioner),
    workspacePullRequest: new WorkspacePullRequestService(deps.db, organization),
    voiceTranscription: new VoiceTranscriptionService(deps.db, deps.config, organization),
    serviceToken: new ServiceTokenService(deps.db),
    tokenUsage: new TokenUsageService(deps.db, organization),
    overview: new OverviewService(deps.db, organization),
  };
}

import { listOrganizationNodes, unregisterOrganizationNode, updateOrganizationNodeScope } from "./nodeApi";
import {
  addOrganizationMember,
  cancelOrganizationInvite,
  createOrganization,
  leaveOrganization,
  listOrganizationInvites,
  listOrganizationMembers,
  listOrganizations,
  removeOrganizationMember,
} from "./orgApi";
import { loadOverviewModelBreakdown, loadOverviewTokenUsage, loadOverviewWorkspaceInsights } from "./overviewApi";
import { createProject, deleteProject, listProjects, updateProject } from "./projectApi";
import {
  createScheduledJob,
  deleteScheduledJob,
  listScheduledJobRuns,
  listScheduledJobs,
  pauseScheduledJob,
  resumeScheduledJob,
  runScheduledJobNow,
  updateScheduledJob,
} from "./scheduledJobApi";
import { createServiceToken, listServiceTokens, revokeServiceToken } from "./serviceTokenApi";
import { getVoiceTranscriptionUsage, transcribeVoice } from "./voiceTranscriptionApi";
import { createProjectWorkspace, listProjectWorkspaces } from "./workspaceApi";
import { listWorkspacePullRequests, upsertWorkspacePullRequest } from "./workspacePullRequestApi";

export const api = {
  org: {
    list: listOrganizations,
    create: createOrganization,
    listMembers: listOrganizationMembers,
    addMember: addOrganizationMember,
    removeMember: removeOrganizationMember,
    leave: leaveOrganization,
    listInvites: listOrganizationInvites,
    cancelInvite: cancelOrganizationInvite,
  },
  node: {
    listByOrg: listOrganizationNodes,
    updateScope: updateOrganizationNodeScope,
    unregister: unregisterOrganizationNode,
  },
  project: {
    listByOrg: listProjects,
    create: createProject,
    delete: deleteProject,
    update: updateProject,
  },
  workspace: {
    listByProject: listProjectWorkspaces,
    createForProject: createProjectWorkspace,
  },
  workspacePullRequest: {
    list: listWorkspacePullRequests,
    upsert: upsertWorkspacePullRequest,
  },
  scheduledJob: {
    listByOrg: listScheduledJobs,
    create: createScheduledJob,
    update: updateScheduledJob,
    pause: pauseScheduledJob,
    resume: resumeScheduledJob,
    runNow: runScheduledJobNow,
    delete: deleteScheduledJob,
    listRuns: listScheduledJobRuns,
  },
  voiceTranscription: {
    transcribe: transcribeVoice,
    getUsage: getVoiceTranscriptionUsage,
  },
  serviceToken: {
    list: listServiceTokens,
    create: createServiceToken,
    revoke: revokeServiceToken,
  },
  overview: {
    loadTokenUsage: loadOverviewTokenUsage,
    loadModelBreakdown: loadOverviewModelBreakdown,
    loadWorkspaceInsights: loadOverviewWorkspaceInsights,
  },
};

export type ApiClient = typeof api;

import { listOrganizationNodes } from "./nodeApi";
import {
  addOrganizationMember,
  cancelOrganizationInvite,
  createOrganization,
  listOrganizationInvites,
  listOrganizationMembers,
  listOrganizations,
} from "./orgApi";
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
import { createProjectWorkspace, listProjectWorkspaces } from "./workspaceApi";
import { listWorkspacePullRequests, upsertWorkspacePullRequest } from "./workspacePullRequestApi";

export const api = {
  org: {
    list: listOrganizations,
    create: createOrganization,
    listMembers: listOrganizationMembers,
    addMember: addOrganizationMember,
    listInvites: listOrganizationInvites,
    cancelInvite: cancelOrganizationInvite,
  },
  node: {
    listByOrg: listOrganizationNodes,
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
};

export type ApiClient = typeof api;

export const queryKeys = {
  me: ["me"] as const,
  organizations: ["organizations"] as const,
  nodes: (organizationId: string) => ["organizations", organizationId, "nodes"] as const,
  projects: (organizationId: string, withWorkspaces = false) =>
    ["organizations", organizationId, "projects", withWorkspaces ? "with-workspaces" : "base"] as const,
  project: (organizationId: string, projectId: string) =>
    ["organizations", organizationId, "projects", projectId] as const,
  workspaces: (organizationId: string, projectId: string) =>
    ["organizations", organizationId, "projects", projectId, "workspaces"] as const,
  workspaceFiles: (organizationId: string, projectId: string, workspaceId: string, path = "", recursive = false) =>
    [
      "organizations",
      organizationId,
      "projects",
      projectId,
      "workspaces",
      workspaceId,
      "files",
      path,
      recursive,
    ] as const,
  workspaceFile: (organizationId: string, projectId: string, workspaceId: string, path: string, maxChars = 0) =>
    [
      "organizations",
      organizationId,
      "projects",
      projectId,
      "workspaces",
      workspaceId,
      "file",
      path,
      maxChars,
    ] as const,
  workspaceDiff: (organizationId: string, projectId: string, workspaceId: string, path: string, maxChars = 0) =>
    [
      "organizations",
      organizationId,
      "projects",
      projectId,
      "workspaces",
      workspaceId,
      "diff",
      path,
      maxChars,
    ] as const,
  workspaceChanges: (organizationId: string, projectId: string, workspaceId: string) =>
    ["organizations", organizationId, "projects", projectId, "workspaces", workspaceId, "changes"] as const,
  workspaceBranches: (organizationId: string, projectId: string, workspaceId: string) =>
    ["organizations", organizationId, "projects", projectId, "workspaces", workspaceId, "git", "branches"] as const,
  workspaceCurrentPullRequest: (organizationId: string, projectId: string, workspaceId: string) =>
    [
      "organizations",
      organizationId,
      "projects",
      projectId,
      "workspaces",
      workspaceId,
      "pull-request",
      "current",
    ] as const,
  workspacePullRequests: (organizationId: string, projectId: string, workspaceId: string) =>
    ["organizations", organizationId, "projects", projectId, "workspaces", workspaceId, "pull-requests"] as const,
};

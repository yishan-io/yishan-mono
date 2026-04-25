import { StatusCodes } from "http-status-codes";

export class AppError extends Error {
  readonly isBusinessError = true;

  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export type ValidationIssue = {
  path: string;
  message: string;
  code: string;
};

export function isBusinessError(error: unknown): error is AppError {
  return (
    typeof error === "object" &&
    error !== null &&
    "isBusinessError" in error &&
    (error as { isBusinessError?: unknown }).isBusinessError === true &&
    "message" in error
  );
}

export class InvalidOrganizationMembersError extends AppError {
  constructor(readonly missingUserIds: string[]) {
    super(
      "One or more member users do not exist",
      StatusCodes.BAD_REQUEST,
      "INVALID_ORGANIZATION_MEMBERS",
      { missingUserIds }
    );
    this.name = "InvalidOrganizationMembersError";
  }
}

export class OrganizationNotFoundError extends AppError {
  constructor(organizationId: string) {
    super("Organization not found", StatusCodes.NOT_FOUND, "ORGANIZATION_NOT_FOUND", {
      organizationId
    });
    this.name = "OrganizationNotFoundError";
  }
}

export class OrganizationOwnerRequiredError extends AppError {
  constructor() {
    super(
      "Only organization owners can delete this organization",
      StatusCodes.FORBIDDEN,
      "ORGANIZATION_OWNER_REQUIRED"
    );
    this.name = "OrganizationOwnerRequiredError";
  }
}

export class OrganizationManageMembersPermissionRequiredError extends AppError {
  constructor() {
    super(
      "Only organization owners or admins can manage members",
      StatusCodes.FORBIDDEN,
      "ORGANIZATION_MANAGE_MEMBERS_PERMISSION_REQUIRED"
    );
    this.name = "OrganizationManageMembersPermissionRequiredError";
  }
}

export class InvalidOrganizationMemberRoleError extends AppError {
  constructor(role: string) {
    super(
      "Invalid organization member role",
      StatusCodes.BAD_REQUEST,
      "INVALID_ORGANIZATION_MEMBER_ROLE",
      { role, allowedRoles: ["member", "admin"] }
    );
    this.name = "InvalidOrganizationMemberRoleError";
  }
}

export class OrganizationMemberAlreadyExistsError extends AppError {
  constructor(userId: string) {
    super(
      "User is already a member of this organization",
      StatusCodes.CONFLICT,
      "ORGANIZATION_MEMBER_ALREADY_EXISTS",
      { userId }
    );
    this.name = "OrganizationMemberAlreadyExistsError";
  }
}

export class OrganizationMemberNotFoundError extends AppError {
  constructor(userId: string) {
    super(
      "Organization member not found",
      StatusCodes.NOT_FOUND,
      "ORGANIZATION_MEMBER_NOT_FOUND",
      { userId }
    );
    this.name = "OrganizationMemberNotFoundError";
  }
}

export class OrganizationOwnerRemovalNotAllowedError extends AppError {
  constructor() {
    super(
      "Organization owners cannot be removed. Delete the organization instead.",
      StatusCodes.BAD_REQUEST,
      "ORGANIZATION_OWNER_REMOVAL_NOT_ALLOWED"
    );
    this.name = "OrganizationOwnerRemovalNotAllowedError";
  }
}

export class ValidationError extends AppError {
  constructor(issues: ValidationIssue[]) {
    super("Invalid request payload", StatusCodes.BAD_REQUEST, "VALIDATION_ERROR", { issues });
    this.name = "ValidationError";
  }
}

export class NodeNotFoundError extends AppError {
  constructor(nodeId: string) {
    super("Node not found", StatusCodes.NOT_FOUND, "NODE_NOT_FOUND", { nodeId });
    this.name = "NodeNotFoundError";
  }
}

export class RemoteNodeOrganizationRequiredError extends AppError {
  constructor() {
    super(
      "remote nodes require an organization",
      StatusCodes.BAD_REQUEST,
      "REMOTE_NODE_ORGANIZATION_REQUIRED"
    );
    this.name = "RemoteNodeOrganizationRequiredError";
  }
}

export class LocalNodeOrganizationNotAllowedError extends AppError {
  constructor() {
    super(
      "local nodes cannot be attached to an organization",
      StatusCodes.BAD_REQUEST,
      "LOCAL_NODE_ORGANIZATION_NOT_ALLOWED"
    );
    this.name = "LocalNodeOrganizationNotAllowedError";
  }
}

export class OrganizationNodePermissionRequiredError extends AppError {
  constructor() {
    super(
      "Only organization owners or admins can manage remote nodes",
      StatusCodes.FORBIDDEN,
      "ORGANIZATION_NODE_PERMISSION_REQUIRED"
    );
    this.name = "OrganizationNodePermissionRequiredError";
  }
}

export class NodeDeletePermissionRequiredError extends AppError {
  constructor() {
    super(
      "You do not have permission to delete this node",
      StatusCodes.FORBIDDEN,
      "NODE_DELETE_PERMISSION_REQUIRED"
    );
    this.name = "NodeDeletePermissionRequiredError";
  }
}

export class OrganizationMembershipRequiredError extends AppError {
  constructor() {
    super(
      "You are not a member of this organization",
      StatusCodes.FORBIDDEN,
      "ORGANIZATION_MEMBERSHIP_REQUIRED"
    );
    this.name = "OrganizationMembershipRequiredError";
  }
}

export class ProjectInvalidGitUrlError extends AppError {
  constructor(repoUrl: string) {
    super("Invalid project repoUrl", StatusCodes.BAD_REQUEST, "PROJECT_INVALID_GIT_URL", { repoUrl });
    this.name = "ProjectInvalidGitUrlError";
  }
}

export class ProjectNotFoundError extends AppError {
  constructor(projectId: string) {
    super("Project not found", StatusCodes.NOT_FOUND, "PROJECT_NOT_FOUND", { projectId });
    this.name = "ProjectNotFoundError";
  }
}

export class WorkspaceNodeNotFoundError extends AppError {
  constructor(nodeId: string) {
    super("Node not found", StatusCodes.BAD_REQUEST, "WORKSPACE_NODE_NOT_FOUND", { nodeId });
    this.name = "WorkspaceNodeNotFoundError";
  }
}

export class WorkspaceLocalNodeScopeInvalidError extends AppError {
  constructor(nodeId: string) {
    super(
      "Workspaces require a private scope node",
      StatusCodes.BAD_REQUEST,
      "WORKSPACE_LOCAL_NODE_SCOPE_INVALID",
      { nodeId }
    );
    this.name = "WorkspaceLocalNodeScopeInvalidError";
  }
}

export class WorkspaceLocalNodePermissionRequiredError extends AppError {
  constructor() {
    super(
      "You do not have permission to use this local node",
      StatusCodes.FORBIDDEN,
      "WORKSPACE_LOCAL_NODE_PERMISSION_REQUIRED"
    );
    this.name = "WorkspaceLocalNodePermissionRequiredError";
  }
}

export class WorkspaceBranchRequiredError extends AppError {
  constructor() {
    super(
      "Worktree workspaces require branch",
      StatusCodes.BAD_REQUEST,
      "WORKSPACE_BRANCH_REQUIRED"
    );
    this.name = "WorkspaceBranchRequiredError";
  }
}

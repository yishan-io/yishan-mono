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

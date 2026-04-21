import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

import { ValidationError, type ValidationIssue } from "@/errors";

function normalizeValidationIssues(error: unknown): ValidationIssue[] {
  if (
    typeof error !== "object" ||
    error === null ||
    !("issues" in error) ||
    !Array.isArray((error as { issues?: unknown }).issues)
  ) {
    return [
      {
        path: "",
        message: "Validation failed",
        code: "invalid_request"
      }
    ];
  }

  const issues = (error as { issues: Array<Record<string, unknown>> }).issues;
  return issues.map((issue) => {
    const rawPath = Array.isArray(issue.path) ? issue.path : [];
    const path = rawPath.map((part) => String(part)).join(".");
    const message = typeof issue.message === "string" ? issue.message : "Invalid value";
    const code = typeof issue.code === "string" ? issue.code : "invalid_value";

    return { path, message, code };
  });
}

export const validationErrorResponse = (result: any, c: Context) => {
  if (result.success) {
    return;
  }

  const appError = new ValidationError(normalizeValidationIssues(result.error));
  return c.json(
    {
      error: appError.message,
      code: appError.code,
      ...(appError.details ?? {})
    },
    appError.status as ContentfulStatusCode
  );
};

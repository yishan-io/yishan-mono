import { type ProjectFieldErrors, hasProjectFieldErrors } from "@/features/projects/forms/project-form";

export type ProjectCreateDraft = {
  name: string;
  repoUrl: string;
};

export function createEmptyProjectCreateDraft(): ProjectCreateDraft {
  return {
    name: "",
    repoUrl: "",
  };
}

export function isProjectCreateSubmitDisabled(args: {
  createPending: boolean;
  formErrors: ProjectFieldErrors;
  organizationId: string | null;
}) {
  const { createPending, formErrors, organizationId } = args;
  return !organizationId || hasProjectFieldErrors(formErrors) || createPending;
}

import type { CreateProjectInput, UpdateProjectInput } from "../projects.types";

export type ProjectDraft = Required<UpdateProjectInput>;
export type ProjectFormTranslator = (key: string, params?: Record<string, string | number>) => string;

export type ProjectFieldErrors = {
  name?: string;
  repoUrl?: string;
  icon?: string;
  color?: string;
};

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function isValidGitUrl(value: string): boolean {
  if (value.startsWith("git@") && value.includes(":")) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return ["https:", "http:", "ssh:", "git:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function validateName(name: string, t: ProjectFormTranslator): string | undefined {
  if (!name.trim()) {
    return t("validation.project.nameRequired");
  }

  return undefined;
}

function validateRepoUrl(repoUrl: string, t: ProjectFormTranslator): string | undefined {
  const trimmed = repoUrl.trim();
  if (!trimmed) {
    return undefined;
  }

  if (!isValidGitUrl(trimmed)) {
    return t("validation.project.gitUrlInvalid");
  }

  return undefined;
}

function validateIcon(icon: string, t: ProjectFormTranslator): string | undefined {
  if (!icon.trim()) {
    return t("validation.project.iconRequired");
  }

  return undefined;
}

function validateColor(color: string, t: ProjectFormTranslator): string | undefined {
  if (!color.trim()) {
    return t("validation.project.colorRequired");
  }

  if (!HEX_COLOR_PATTERN.test(color.trim())) {
    return t("validation.project.colorInvalid");
  }

  return undefined;
}

export function validateCreateProjectForm(
  input: { name: string; repoUrl: string },
  t: ProjectFormTranslator,
): ProjectFieldErrors {
  return {
    name: validateName(input.name, t),
    repoUrl: validateRepoUrl(input.repoUrl, t),
  };
}

export function validateProjectDraft(draft: ProjectDraft, t: ProjectFormTranslator): ProjectFieldErrors {
  return {
    name: validateName(draft.name, t),
    icon: validateIcon(draft.icon, t),
    color: validateColor(draft.color, t),
  };
}

export function toCreateProjectInput(input: { name: string; repoUrl: string }): CreateProjectInput {
  const repoUrl = input.repoUrl.trim();

  return {
    name: input.name.trim(),
    ...(repoUrl ? { repoUrl } : {}),
  };
}

export function toUpdateProjectInput(draft: ProjectDraft): UpdateProjectInput {
  return {
    name: draft.name.trim(),
    icon: draft.icon.trim(),
    color: draft.color.trim(),
    contextEnabled: draft.contextEnabled,
  };
}

export function hasProjectFieldErrors(errors: ProjectFieldErrors): boolean {
  return Object.values(errors).some((value) => value !== undefined);
}

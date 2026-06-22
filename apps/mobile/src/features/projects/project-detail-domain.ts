import type { Project } from "./projects.types";

type Translate = (key: string, params?: Record<string, string | number>) => string;

export type ProjectDetailRow = {
  label: string;
  value: string;
};

function readProjectDetailValue(value: string | null, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function buildProjectDetailRows(project: Project | null, t: Translate): ProjectDetailRow[] {
  if (!project) {
    return [];
  }

  const fallback = t("common.notSet");
  return [
    { label: t("shell.repositoryUrl"), value: readProjectDetailValue(project.repoUrl, fallback) },
    { label: t("shell.repositoryProvider"), value: readProjectDetailValue(project.repoProvider, fallback) },
    { label: t("shell.repositoryKey"), value: readProjectDetailValue(project.repoKey, fallback) },
    { label: t("shell.sourceType"), value: readProjectDetailValue(project.sourceType, fallback) },
    { label: t("shell.iconName"), value: readProjectDetailValue(project.icon, fallback) },
    { label: t("shell.hexColor"), value: readProjectDetailValue(project.color, fallback) },
    {
      label: t("shell.contextEnabled"),
      value: project.contextEnabled ? t("common.enabled") : t("common.disabled"),
    },
  ];
}

export function buildProjectDetailSummary(project: Project | null, t: Translate) {
  if (!project) {
    return null;
  }

  return project.repoUrl?.trim() ? t("shell.projectMetadataSummaryLinked") : t("shell.projectMetadataSummaryUnlinked");
}

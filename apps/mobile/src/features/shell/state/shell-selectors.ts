import type { Project } from "@/features/projects/projects.types";
import type { ShellSelection, TerminalItem } from "./shell.types";

export function getCurrentOrganizationId(
  organizationIds: string[],
  navigationOrganizationId: string | null,
  selection: ShellSelection,
): string | null {
  if (navigationOrganizationId && organizationIds.includes(navigationOrganizationId)) {
    return navigationOrganizationId;
  }

  if (selection.kind === "workspace" && organizationIds.includes(selection.orgId)) {
    return selection.orgId;
  }

  return organizationIds[0] ?? null;
}

export function findTerminal(terminals: TerminalItem[], terminalId: string) {
  return terminals.find((terminal) => terminal.id === terminalId) ?? null;
}

export function findProjectName(projects: Project[] | undefined, projectId: string) {
  return projects?.find((project) => project.id === projectId)?.name ?? null;
}

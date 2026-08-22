import { type OverlayPanel, workbenchNavigationStore } from "../state/workbenchNavigationStore";
/**
 * Workbench navigation Commands (desktop6-adjust.md W2).
 *
 * Public write API for the active Workspace/Project context and the overlay
 * panel. Workbench owns Desktop context; callers (Workspace Commands/UI, App)
 * resolve workspace↔project ids from their own data and pass both ids here.
 * The active Tab is resolved by Workbench (`resolveTabForWorkspace`).
 */
import { resolveTabForWorkspace } from "./tabCommands";

/**
 * Activates one workspace: sets the active context, closes the overlay, and
 * resolves the Tab for the workspace. `projectId` is optional for callers
 * that only know the workspace id; when omitted the active project stays.
 */
export function activateWorkspace(input: { workspaceId: string; projectId?: string }): void {
  if (input.workspaceId.trim()) {
    workbenchNavigationStore.getState().closeOverlayPanel();
  }
  workbenchNavigationStore.getState().setActiveWorkspaceId(input.workspaceId);
  if (input.projectId !== undefined) {
    workbenchNavigationStore.getState().setActiveProjectId(input.projectId);
  }
  resolveTabForWorkspace(input.workspaceId);
}

/**
 * Activates one project: sets the active project context, closes the overlay,
 * and resolves the Tab for the active workspace (or the given one).
 */
export function activateProject(input: { projectId: string; workspaceId?: string }): void {
  if (input.projectId.trim()) {
    workbenchNavigationStore.getState().closeOverlayPanel();
  }
  workbenchNavigationStore.getState().setActiveProjectId(input.projectId);
  if (input.workspaceId !== undefined) {
    workbenchNavigationStore.getState().setActiveWorkspaceId(input.workspaceId);
  }
  const workspaceId = input.workspaceId ?? workbenchNavigationStore.getState().activeWorkspaceId;
  resolveTabForWorkspace(workspaceId);
}

/** Shows one overlay panel in place of the main pane. Pass null to close. */
export function openOverlayPanel(panel: OverlayPanel | null): void {
  workbenchNavigationStore.getState().setOverlayPanel(panel);
}

/** Closes any open overlay panel. */
export function closeOverlayPanel(): void {
  workbenchNavigationStore.getState().closeOverlayPanel();
}

/** Toggles the global Task Hub and clears workspace/project context when opening it. */
export function toggleTaskHubOverlay(): void {
  const navigation = workbenchNavigationStore.getState();
  if (navigation.overlayPanel === "tasks") {
    navigation.closeOverlayPanel();
    return;
  }
  navigation.setActiveProjectId("");
  navigation.setActiveWorkspaceId("");
  navigation.setOverlayPanel("tasks");
}

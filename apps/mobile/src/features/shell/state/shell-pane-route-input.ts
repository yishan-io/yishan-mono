import type { ShellFocusPreview, WorkspacePaneStoreState } from "@/features/shell/state/shell.types";
import { upsertWorkspacePreviewStoreState } from "@/features/shell/state/shellPaneStoreUpsert";
import type { WorkspaceContext } from "./shell-route-state";

export function buildWorkspacePaneRouteInputKey(input: {
  routePreview: ShellFocusPreview;
  workspaceId: string;
}): string | null {
  const { routePreview, workspaceId } = input;
  if (!routePreview) {
    return null;
  }

  if (routePreview.kind === "file") {
    return `${workspaceId}:file:${routePreview.path}`;
  }

  return `${workspaceId}:diff:${routePreview.changeKind}:${routePreview.path}`;
}

export function resolveWorkspacePaneRouteInput(input: {
  currentWorkspaceContext: WorkspaceContext | null;
  hydratedWorkspaceId: string | null;
  isScreenFocused: boolean;
  lastAppliedRouteInputKey: string | null;
  routePreview: ShellFocusPreview;
  storeState: WorkspacePaneStoreState;
}): {
  nextRouteInputKey: string | null;
  nextStoreState: WorkspacePaneStoreState;
  shouldApply: boolean;
} {
  if (!input.routePreview) {
    return {
      nextRouteInputKey: null,
      nextStoreState: input.storeState,
      shouldApply: false,
    };
  }

  if (
    !input.isScreenFocused ||
    !input.currentWorkspaceContext ||
    input.hydratedWorkspaceId !== input.currentWorkspaceContext.workspaceId
  ) {
    return {
      nextRouteInputKey: input.lastAppliedRouteInputKey,
      nextStoreState: input.storeState,
      shouldApply: false,
    };
  }

  const nextRouteInputKey = buildWorkspacePaneRouteInputKey({
    routePreview: input.routePreview,
    workspaceId: input.currentWorkspaceContext.workspaceId,
  });
  if (!nextRouteInputKey || nextRouteInputKey === input.lastAppliedRouteInputKey) {
    return {
      nextRouteInputKey,
      nextStoreState: input.storeState,
      shouldApply: false,
    };
  }

  return {
    nextRouteInputKey,
    nextStoreState: upsertWorkspacePreviewStoreState(
      input.storeState,
      input.currentWorkspaceContext.workspaceId,
      input.routePreview,
      { temporary: false },
    ),
    shouldApply: true,
  };
}

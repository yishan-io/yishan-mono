import { useCallback, useEffect, useState } from "react";

import type { ShellFocusPreview, ShellSelection } from "../state/shell.types";

function previewsEqual(left: ShellFocusPreview | undefined, right: ShellFocusPreview) {
  if (left === undefined) {
    return false;
  }

  if (left === null || right === null) {
    return left === right;
  }

  if (left.kind !== right.kind) {
    return false;
  }

  if (left.kind === "diff" && right.kind === "diff") {
    return left.path === right.path && left.changeKind === right.changeKind;
  }

  return left.kind === right.kind && left.path === right.path;
}

export function useShellFocusState(
  selection: ShellSelection,
  routeFocus: { preview: ShellFocusPreview; tab: "files" | "changes" | null },
  pendingPreview: ShellFocusPreview | undefined,
) {
  const [preview, setPreview] = useState<ShellFocusPreview>(null);
  const selectionKey =
    selection.kind === "workspace"
      ? `${selection.orgId}:${selection.projectId}:${selection.workspaceId}`
      : selection.kind;

  useEffect(() => {
    if (!selectionKey) {
      return;
    }

    setPreview(pendingPreview === undefined ? null : pendingPreview);
  }, [pendingPreview, selectionKey]);

  useEffect(() => {
    if (!routeFocus.tab && !routeFocus.preview && previewsEqual(pendingPreview, routeFocus.preview)) {
      return;
    }

    setPreview(routeFocus.preview);
  }, [pendingPreview, routeFocus.preview, routeFocus.tab]);

  const closePreview = useCallback(() => {
    setPreview(null);
  }, []);

  return {
    closePreview,
    preview,
  };
}

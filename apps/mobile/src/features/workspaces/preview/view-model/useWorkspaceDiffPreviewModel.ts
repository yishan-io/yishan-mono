import { useMemo } from "react";

import { buildUnifiedDiffLines } from "@/features/workspaces/file-browser";
import { useWorkspaceDiffQuery } from "@/features/workspaces/queries/useWorkspaceDiffQuery";
import type { WorkspaceGitChangeKind } from "@/features/workspaces/workspaces.types";

const MAX_DIFF_CHARS = 20_000;
const MAX_DIFF_LINES = 1_200;

type UseWorkspaceDiffPreviewModelOptions = {
  changeKind: WorkspaceGitChangeKind | null;
  nodeId: string | null;
  organizationId: string;
  path: string;
  projectId: string;
  workspaceId: string;
};

export type WorkspaceDiffPreviewModel = {
  changeKind: WorkspaceGitChangeKind | null;
  error: boolean;
  loading: boolean;
  lines: ReturnType<typeof buildUnifiedDiffLines>;
  previewUnavailable: boolean;
  refetch: () => Promise<unknown>;
  truncated: boolean;
};

export function useWorkspaceDiffPreviewModel({
  changeKind,
  nodeId,
  organizationId,
  path,
  projectId,
  workspaceId,
}: UseWorkspaceDiffPreviewModelOptions): WorkspaceDiffPreviewModel {
  const diffQuery = useWorkspaceDiffQuery(organizationId, projectId, workspaceId, path, {
    enabled: path.trim().length > 0,
    maxChars: MAX_DIFF_CHARS,
    nodeId,
  });

  const diffLines = useMemo(
    () => buildUnifiedDiffLines(diffQuery.data?.oldContent ?? "", diffQuery.data?.newContent ?? ""),
    [diffQuery.data?.newContent, diffQuery.data?.oldContent],
  );
  const lines = useMemo(() => diffLines.slice(0, MAX_DIFF_LINES), [diffLines]);
  const truncated = Boolean(diffQuery.data?.truncated) || diffLines.length > MAX_DIFF_LINES;

  return {
    changeKind,
    error: diffQuery.isError,
    lines,
    loading: diffQuery.isLoading,
    previewUnavailable: Boolean(diffQuery.data?.previewUnavailable),
    refetch: diffQuery.refetch,
    truncated,
  };
}

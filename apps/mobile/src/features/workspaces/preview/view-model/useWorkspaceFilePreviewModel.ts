import { detectFilePreviewKind, splitPreviewLines } from "@yishan/file-browser-core";
import { useMemo } from "react";

import { useWorkspaceFileQuery } from "@/features/workspaces/queries/useWorkspaceFileQuery";

const MAX_PREVIEW_CHARS = 20_000;
const MAX_PREVIEW_LINES = 1_200;

type UseWorkspaceFilePreviewModelOptions = {
  organizationId: string;
  path: string;
  projectId: string;
  workspaceId: string;
};

export type WorkspaceFilePreviewModel = {
  error: boolean;
  loading: boolean;
  path: string;
  previewKind: ReturnType<typeof detectFilePreviewKind>;
  previewLines: string[];
  previewText: string;
  refetch: () => Promise<unknown>;
  truncated: boolean;
};

export function useWorkspaceFilePreviewModel({
  organizationId,
  path,
  projectId,
  workspaceId,
}: UseWorkspaceFilePreviewModelOptions): WorkspaceFilePreviewModel {
  const previewKind = detectFilePreviewKind(path);
  const fileQuery = useWorkspaceFileQuery(organizationId, projectId, workspaceId, path, {
    enabled: previewKind !== null && previewKind !== "image" && previewKind !== "unsupported",
    maxChars: MAX_PREVIEW_CHARS,
  });
  const previewText = fileQuery.data?.content ?? "";
  const allPreviewLines = useMemo(() => splitPreviewLines(previewText), [previewText]);
  const previewLines = useMemo(() => allPreviewLines.slice(0, MAX_PREVIEW_LINES), [allPreviewLines]);
  const truncated = Boolean(fileQuery.data?.truncated) || allPreviewLines.length > MAX_PREVIEW_LINES;

  return {
    error: fileQuery.isError,
    loading: fileQuery.isLoading,
    path,
    previewKind,
    previewLines,
    previewText,
    refetch: fileQuery.refetch,
    truncated,
  };
}

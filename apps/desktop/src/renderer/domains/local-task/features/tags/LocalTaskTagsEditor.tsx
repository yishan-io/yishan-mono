import { Alert, Box } from "@mui/material";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useCallback, useState } from "react";
import type { LocalTaskTagCatalogEntry, LocalTaskTagRef } from "../../localTaskTypes";
import { LocalTaskTagsInput } from "./LocalTaskTagsInput";

type LocalTaskTagsEditorProps = {
  tagRefs?: LocalTaskTagRef[];
  tagCatalog?: LocalTaskTagCatalogEntry[];
  onTagIdsChange?: (tagIds: string[]) => Promise<unknown>;
  onCreateTag?: (name: string) => Promise<LocalTaskTagCatalogEntry>;
  /** @deprecated Compatibility inputs for pre-ID callers. */
  tags?: string[];
  suggestions?: string[];
  onTagsChange?: (tags: string[]) => Promise<unknown>;
  onTagColorChange?: (...args: never[]) => Promise<unknown>;
  isMutationLoading?: boolean;
};

/** Edits task tag references by stable catalog ID. */
export function LocalTaskTagsEditor({
  tagRefs,
  tagCatalog = [],
  onTagIdsChange,
  onCreateTag,
  tags,
  onTagsChange,
  isMutationLoading = false,
}: LocalTaskTagsEditorProps) {
  const [mutationError, setMutationError] = useState<string | null>(null);
  const handleChange = useCallback(
    (tagIds: string[]) => {
      setMutationError(null);
      const mutation = onTagIdsChange?.(tagIds) ?? onTagsChange?.(tagIds) ?? Promise.resolve();
      void mutation.catch((error: unknown) => setMutationError(getErrorMessage(error)));
    },
    [onTagIdsChange, onTagsChange],
  );
  return (
    <Box>
      <LocalTaskTagsInput
        disabled={isMutationLoading}
        tagIds={tagRefs?.map((tagRef) => tagRef.id)}
        tags={tagRefs === undefined ? tags : undefined}
        tagCatalog={tagCatalog}
        onChange={handleChange}
        onCreateTag={onCreateTag}
      />
      {mutationError ? <Alert severity="error">{mutationError}</Alert> : null}
    </Box>
  );
}

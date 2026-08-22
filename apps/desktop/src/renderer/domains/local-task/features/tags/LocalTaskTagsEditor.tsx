import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
} from "@mui/material";
import { getErrorMessage } from "@shared/errors/getErrorMessage";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuPlus, LuX } from "react-icons/lu";
import { getLocalTaskTagsValidationError } from "../../localTaskTags";
import { LocalTaskTagsInput } from "./LocalTaskTagsInput";

type LocalTaskTagsEditorProps = {
  tags: string[];
  suggestions: string[];
  onTagsChange: (tags: string[]) => Promise<unknown>;
  isMutationLoading?: boolean;
};

/** Edits Local Task tags through direct deletion and a dialog for batch additions. */
export function LocalTaskTagsEditor({ tags, suggestions, onTagsChange, isMutationLoading }: LocalTaskTagsEditorProps) {
  const { t } = useTranslation();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newTags, setNewTags] = useState<string[]>([]);
  const [isNewTagsInputValid, setIsNewTagsInputValid] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isDisabled = isMutationLoading || isSubmitting;
  const combinedTags = useMemo(() => [...tags, ...newTags], [newTags, tags]);
  const combinedTagsError = useMemo(() => getLocalTaskTagsValidationError(combinedTags), [combinedTags]);
  const canSubmit = newTags.length > 0 && isNewTagsInputValid && !combinedTagsError && !isDisabled;

  const handleOpenAddDialog = useCallback(() => {
    setNewTags([]);
    setIsNewTagsInputValid(true);
    setSubmitError(null);
    setIsAddDialogOpen(true);
  }, []);
  const handleCloseAddDialog = useCallback(() => {
    if (isDisabled) return;
    setIsAddDialogOpen(false);
    setNewTags([]);
    setSubmitError(null);
  }, [isDisabled]);
  const handleDeleteTag = useCallback(
    async (tagToDelete: string) => {
      if (isDisabled) return;
      setIsSubmitting(true);
      setSubmitError(null);
      try {
        await onTagsChange(tags.filter((tag) => tag !== tagToDelete));
      } catch (error) {
        setSubmitError(getErrorMessage(error));
      } finally {
        setIsSubmitting(false);
      }
    },
    [isDisabled, onTagsChange, tags],
  );
  const handleSubmitAdditions = useCallback(async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onTagsChange(combinedTags);
      setIsAddDialogOpen(false);
      setNewTags([]);
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }, [canSubmit, combinedTags, onTagsChange]);

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
        {tags.map((tag) => (
          <Chip
            key={tag}
            size="small"
            variant="outlined"
            label={tag}
            disabled={isDisabled}
            onDelete={() => void handleDeleteTag(tag)}
            deleteIcon={<LuX aria-label={t("localTask.tags.delete", { tag })} />}
          />
        ))}
        <Tooltip title={t("localTask.tags.add")}>
          <Box component="span">
            <IconButton
              size="small"
              disabled={isDisabled}
              aria-label={t("localTask.tags.add")}
              onClick={handleOpenAddDialog}
            >
              <LuPlus size={16} />
            </IconButton>
          </Box>
        </Tooltip>
      </Box>
      {submitError && !isAddDialogOpen ? <Alert severity="error">{submitError}</Alert> : null}
      <Dialog open={isAddDialogOpen} onClose={handleCloseAddDialog} fullWidth maxWidth="sm">
        <DialogTitle>{t("localTask.tags.addTitle")}</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <LocalTaskTagsInput
              tags={newTags}
              suggestions={suggestions}
              onChange={setNewTags}
              onDraftValidityChange={setIsNewTagsInputValid}
              disabled={isDisabled}
              label={t("localTask.tags.addInput")}
            />
            {combinedTagsError ? (
              <Alert severity="error" sx={{ mt: 1 }}>
                {combinedTagsError}
              </Alert>
            ) : null}
            {submitError ? (
              <Alert severity="error" sx={{ mt: 1 }}>
                {submitError}
              </Alert>
            ) : null}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button disabled={isDisabled} onClick={handleCloseAddDialog}>
            {t("common.actions.cancel")}
          </Button>
          <Button disabled={!canSubmit} onClick={() => void handleSubmitAdditions()}>
            {t("localTask.actions.add")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

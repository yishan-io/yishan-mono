import { Autocomplete, TextField } from "@mui/material";
import { VirtualizedListbox } from "@renderer/ui/components/VirtualizedListbox";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getLocalTaskTagsValidationError, normalizeLocalTaskTag } from "../../localTaskTags";

type LocalTaskTagsInputProps = {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
  onDraftValidityChange?: (isValid: boolean) => void;
  disabled?: boolean;
  label?: string;
};

/** Renders controlled free-form Local Task tags without transport or store dependencies. */
export function LocalTaskTagsInput({
  tags,
  suggestions,
  onChange,
  onDraftValidityChange,
  disabled = false,
  label,
}: LocalTaskTagsInputProps) {
  const { t } = useTranslation();
  const [draftTags, setDraftTags] = useState(tags);
  const tagsKey = JSON.stringify(tags);
  const previousTagsKeyRef = useRef(tagsKey);
  const validationError = useMemo(() => getLocalTaskTagsValidationError(draftTags), [draftTags]);

  useEffect(() => {
    if (previousTagsKeyRef.current === tagsKey) return;
    previousTagsKeyRef.current = tagsKey;
    setDraftTags(tags);
  }, [tags, tagsKey]);

  useEffect(() => {
    onDraftValidityChange?.(!validationError);
  }, [onDraftValidityChange, validationError]);

  const handleChange = useCallback(
    (_event: React.SyntheticEvent, nextTags: string[]) => {
      const normalizedNextTags = nextTags.map(normalizeLocalTaskTag);
      setDraftTags(normalizedNextTags);
      if (getLocalTaskTagsValidationError(normalizedNextTags)) return;
      onChange(normalizedNextTags);
    },
    [onChange],
  );

  return (
    <Autocomplete<string, true, false, true>
      multiple
      freeSolo
      size="small"
      disabled={disabled}
      options={suggestions}
      value={draftTags}
      onChange={handleChange}
      filterSelectedOptions
      slotProps={{ listbox: { component: VirtualizedListbox } }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label ?? t("localTask.fields.tags")}
          error={Boolean(validationError)}
          helperText={validationError}
        />
      )}
    />
  );
}

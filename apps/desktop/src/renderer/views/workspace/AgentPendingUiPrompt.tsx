import {
  Box,
  Button,
  Checkbox,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AgentPendingUiRequest } from "../../store/agentChatTypes";

type AgentPendingUiPromptProps = {
  request: AgentPendingUiRequest;
  onCancel: () => Promise<void> | void;
  onConfirm: (input: { value?: string; confirmed?: boolean }) => Promise<void> | void;
  onSelectCustomResponse: (value: string) => Promise<void> | void;
};

type SelectOption = {
  index?: number;
  value: string;
  label: string;
  description?: string;
};

/** Renders one pending extension UI request inline in the agent chat tab. */
export function AgentPendingUiPrompt({ request, onCancel, onConfirm, onSelectCustomResponse }: AgentPendingUiPromptProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(request.prefill ?? "");
  const [isSelectingCustomResponse, setIsSelectingCustomResponse] = useState(false);
  const [draftBeforeCustomResponse, setDraftBeforeCustomResponse] = useState<string | null>(null);
  const [selectedMultiSelectIndices, setSelectedMultiSelectIndices] = useState<number[]>([]);

  useEffect(() => {
    setDraft(request.prefill ?? "");
    setIsSelectingCustomResponse(false);
    setDraftBeforeCustomResponse(null);
  }, [request.id, request.prefill]);

  const selectOptions = useMemo<SelectOption[] | undefined>(() => {
    return request.options?.map((option) => ({
      index: option.index,
      value: option.value,
      label: option.label,
      description: option.description,
    }));
  }, [request.options]);

  const parsedMultiSelectPrompt = useMemo(() => {
    if (request.method !== "input" || request.selectionMode !== "multiple" || !selectOptions) {
      return null;
    }

    return {
      question: request.title,
      options: selectOptions.filter((option): option is SelectOption & { index: number } => typeof option.index === "number"),
      allowFreeform: request.allowFreeform === true,
    };
  }, [request.allowFreeform, request.method, request.selectionMode, request.title, selectOptions]);

  useEffect(() => {
    if (!parsedMultiSelectPrompt) {
      setSelectedMultiSelectIndices([]);
      return;
    }

    const nextSelectedIndices = parseSelectedMultiSelectIndices(draft, parsedMultiSelectPrompt.options);
    setSelectedMultiSelectIndices(nextSelectedIndices);
  }, [draft, parsedMultiSelectPrompt]);

  const renderedSelectOptions = selectOptions;

  const displayTitle = useMemo(() => {
    if (parsedMultiSelectPrompt) {
      return parsedMultiSelectPrompt.question;
    }

    return request.title;
  }, [parsedMultiSelectPrompt, request.title]);

  const handleSubmit = useCallback(async () => {
    if (request.method === "select" && isSelectingCustomResponse) {
      await onSelectCustomResponse(draft);
      return;
    }

    await onConfirm({ value: draft });
  }, [draft, isSelectingCustomResponse, onConfirm, onSelectCustomResponse, request.method]);

  const handleSelectOption = useCallback(
    async (optionValue: string) => {
      await onConfirm({ value: optionValue });
    },
    [onConfirm],
  );

  const handleBeginCustomResponse = useCallback(() => {
    setDraftBeforeCustomResponse(draft);
    setDraft(request.prefill ?? "");
    setIsSelectingCustomResponse(true);
  }, [draft, request.prefill]);

  const handleBackToOptions = useCallback(() => {
    setIsSelectingCustomResponse(false);
    setDraft(draftBeforeCustomResponse ?? request.prefill ?? "");
    setDraftBeforeCustomResponse(null);
  }, [draftBeforeCustomResponse, request.prefill]);

  const handleToggleMultiSelectIndex = useCallback((index: number) => {
    setSelectedMultiSelectIndices((currentIndices) => {
      const nextIndices = currentIndices.includes(index)
        ? currentIndices.filter((currentIndex) => currentIndex !== index)
        : [...currentIndices, index].sort((left, right) => left - right);
      setDraft(nextIndices.join(", "));
      return nextIndices;
    });
  }, []);

  const handleConfirmMultiSelect = useCallback(async () => {
    await onConfirm({ value: selectedMultiSelectIndices.join(", ") });
  }, [onConfirm, selectedMultiSelectIndices]);

  return (
    <Box
      data-testid="agent-pending-ui-prompt"
      sx={{
        mx: 2,
        mb: 1,
        px: 1.5,
        py: 1.25,
        border: 1,
        borderColor: "divider",
        borderRadius: 1,
        bgcolor: "background.paper",
      }}
    >
      <Stack direction="row" spacing={1.25} alignItems="flex-start">
        <Box
          sx={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            border: 1,
            borderColor: "divider",
            color: "text.secondary",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            mt: 0.25,
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 600, lineHeight: 1 }}>
            ?
          </Typography>
        </Box>
        <Stack spacing={1.25} sx={{ width: "100%", minWidth: 0 }}>
          <Box>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
              {displayTitle}
            </Typography>
            {request.message ? (
              <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap", mt: 0.5 }}>
                {request.message}
              </Typography>
            ) : null}
          </Box>

        {request.method === "select" ? (
          isSelectingCustomResponse ? (
            <Stack spacing={1}>
              <TextField
                fullWidth
                multiline
                minRows={3}
                placeholder={request.placeholder}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="contained" onClick={() => void handleSubmit()}>
                  {t("common.actions.submit")}
                </Button>
                <Button size="small" variant="text" color="inherit" onClick={handleBackToOptions}>
                  {t("common.actions.back")}
                </Button>
                <Button size="small" variant="text" color="inherit" onClick={() => void onCancel()}>
                  {t("common.actions.cancel")}
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack spacing={1}>
              <List
                disablePadding
                sx={{ border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden", width: "100%" }}
              >
                {renderedSelectOptions?.map((option) => (
                  <ListItemButton
                    key={option.value}
                    onClick={() => void handleSelectOption(option.value)}
                    divider
                    sx={{ width: "100%", alignItems: "flex-start", px: 1.5 }}
                  >
                    <ListItemText
                      primary={option.label}
                      secondary={option.description?.trim() ? option.description : undefined}
                      primaryTypographyProps={{ variant: "body2" }}
                      secondaryTypographyProps={{ variant: "caption", color: "text.secondary" }}
                      sx={{ my: 0 }}
                    />
                  </ListItemButton>
                ))}
                {request.allowFreeform ? (
                  <ListItemButton
                    onClick={handleBeginCustomResponse}
                    sx={{ width: "100%", alignItems: "flex-start", px: 1.5 }}
                  >
                    <ListItemText
                      primary={t("agentChat.askUser.prompt.customResponse")}
                      primaryTypographyProps={{ variant: "body2" }}
                      sx={{ my: 0 }}
                    />
                  </ListItemButton>
                ) : null}
              </List>
              <Box>
                <Button size="small" variant="text" color="inherit" onClick={() => void onCancel()}>
                  {t("common.actions.cancel")}
                </Button>
              </Box>
            </Stack>
          )
        ) : null}

        {request.method === "confirm" ? (
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="contained" onClick={() => void onConfirm({ confirmed: true })}>
              {t("common.actions.confirm")}
            </Button>
            <Button size="small" variant="outlined" onClick={() => void onConfirm({ confirmed: false })}>
              {t("agentChat.askUser.prompt.decline")}
            </Button>
            <Button size="small" variant="text" color="inherit" onClick={() => void onCancel()}>
              {t("common.actions.cancel")}
            </Button>
          </Stack>
        ) : null}

        {parsedMultiSelectPrompt ? (
          isSelectingCustomResponse ? (
            <Stack spacing={1}>
              <TextField
                fullWidth
                multiline
                minRows={3}
                placeholder={request.placeholder}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <Stack direction="row" spacing={1}>
                <Button size="small" variant="contained" onClick={() => void handleSubmit()}>
                  {t("common.actions.submit")}
                </Button>
                <Button size="small" variant="text" color="inherit" onClick={handleBackToOptions}>
                  {t("common.actions.back")}
                </Button>
                <Button size="small" variant="text" color="inherit" onClick={() => void onCancel()}>
                  {t("common.actions.cancel")}
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack spacing={1}>
              <List
                disablePadding
                sx={{ border: 1, borderColor: "divider", borderRadius: 1, overflow: "hidden", width: "100%" }}
              >
                {parsedMultiSelectPrompt.options.map((option) => {
                  const isSelected = selectedMultiSelectIndices.includes(option.index);

                  return (
                    <ListItemButton
                      key={option.index}
                      onClick={() => handleToggleMultiSelectIndex(option.index)}
                      divider
                      sx={{ width: "100%", alignItems: "flex-start", px: 1.5 }}
                    >
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        <Checkbox edge="start" checked={isSelected} tabIndex={-1} disableRipple />
                      </ListItemIcon>
                      <ListItemText
                        primary={option.label}
                        secondary={option.description?.trim() ? option.description : undefined}
                        primaryTypographyProps={{ variant: "body2" }}
                        secondaryTypographyProps={{ variant: "caption", color: "text.secondary" }}
                        sx={{ my: 0 }}
                      />
                    </ListItemButton>
                  );
                })}
                {parsedMultiSelectPrompt.allowFreeform ? (
                  <ListItemButton
                    onClick={handleBeginCustomResponse}
                    sx={{ width: "100%", alignItems: "flex-start", px: 1.5 }}
                  >
                    <ListItemText
                      primary={t("agentChat.askUser.prompt.customResponse")}
                      primaryTypographyProps={{ variant: "body2" }}
                      sx={{ my: 0 }}
                    />
                  </ListItemButton>
                ) : null}
              </List>
              <Stack direction="row" spacing={1}>
                <Button
                  size="small"
                  variant="contained"
                  disabled={selectedMultiSelectIndices.length === 0}
                  onClick={() => void handleConfirmMultiSelect()}
                >
                  {t("common.actions.confirm")}
                </Button>
                <Button size="small" variant="text" color="inherit" onClick={() => void onCancel()}>
                  {t("common.actions.cancel")}
                </Button>
              </Stack>
            </Stack>
          )
        ) : null}

        {(request.method === "input" || request.method === "editor") && !parsedMultiSelectPrompt ? (
          <Stack spacing={1}>
            <TextField
              fullWidth
              multiline={request.method === "editor"}
              minRows={request.method === "editor" ? 6 : 3}
              placeholder={request.placeholder}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="contained" onClick={() => void handleSubmit()}>
                {t("common.actions.submit")}
              </Button>
              <Button size="small" variant="text" color="inherit" onClick={() => void onCancel()}>
                {t("common.actions.cancel")}
              </Button>
            </Stack>
          </Stack>
        ) : null}
        </Stack>
      </Stack>
    </Box>
  );
}

function parseSelectedMultiSelectIndices(
  draft: string,
  options: Array<{
    index: number;
    label: string;
  }>,
): number[] {
  const optionIndexByLabel = new Map(options.map((option) => [option.label, option.index]));

  return draft
    .split(",")
    .map((token) => token.trim())
    .flatMap((token) => {
      if (token.length === 0) {
        return [];
      }

      const numericIndex = Number.parseInt(token, 10);
      if (Number.isInteger(numericIndex) && String(numericIndex) === token) {
        return options.some((option) => option.index === numericIndex) ? [numericIndex] : [];
      }

      const matchedIndex = optionIndexByLabel.get(token);
      return typeof matchedIndex === "number" ? [matchedIndex] : [];
    })
    .filter((index, position, allIndices) => allIndices.indexOf(index) === position)
    .sort((left, right) => left - right);
}

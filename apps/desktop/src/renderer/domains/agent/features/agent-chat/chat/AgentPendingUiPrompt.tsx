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
import { displaySettingsStore } from "@renderer/domains/settings";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { AgentPendingUiRequest } from "../../../chat/agentChatTypes";
import { AGENT_CHAT_FIXED_CONTENT_MAX_WIDTH_PX } from "./AgentChatContentLayout";
import { PendingCustomResponseInput } from "./PendingCustomResponseInput";
import { type SelectOption, usePendingUiDraft } from "./usePendingUiDraft";

type AgentPendingUiPromptProps = {
  request: AgentPendingUiRequest;
  onCancel: () => Promise<void> | void;
  onConfirm: (input: { value?: string; confirmed?: boolean }) => Promise<void> | void;
  onSelectCustomResponse: (value: string) => Promise<void> | void;
};

/** Renders one pending extension UI request inline in the agent chat tab. */
export function AgentPendingUiPrompt({
  request,
  onCancel,
  onConfirm,
  onSelectCustomResponse,
}: AgentPendingUiPromptProps) {
  const { t } = useTranslation();
  const {
    draft,
    setDraft,
    isSelectingCustomResponse,
    selectedMultiSelectIndices,
    parsedMultiSelectPrompt,
    renderedSelectOptions,
    handleSubmit,
    handleSelectOption,
    handleBeginCustomResponse,
    handleBackToOptions,
    handleToggleMultiSelectIndex,
    handleConfirmMultiSelect,
  } = usePendingUiDraft({ request, onCancel, onConfirm, onSelectCustomResponse });

  const displayTitle = useMemo(() => {
    if (parsedMultiSelectPrompt) {
      return parsedMultiSelectPrompt.question;
    }

    return request.title;
  }, [parsedMultiSelectPrompt, request.title]);

  const agentChatWidth = displaySettingsStore((state) => state.agentChatWidth);
  const isFixedWidth = agentChatWidth === "fixed";

  return (
    <Box
      data-testid="agent-pending-ui-prompt"
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: isFixedWidth ? 2 : 1,
        bgcolor: "background.paper",
        boxShadow: "0 -4px 16px 0 rgba(0,0,0,0.12)",
        px: 1.5,
        py: 1.25,
        mb: 1,
        ...(isFixedWidth
          ? {
              alignSelf: "center",
              maxWidth: AGENT_CHAT_FIXED_CONTENT_MAX_WIDTH_PX,
              width: "calc(100% - 32px)",
            }
          : { mx: 2 }),
      }}
    >
      <Stack
        direction="row"
        spacing={1.25}
        sx={{
          alignItems: "flex-start",
        }}
      >
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            bgcolor: "primary.main",
            color: "primary.contrastText",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            mt: 0.25,
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, lineHeight: 1 }}>
            ?
          </Typography>
        </Box>
        <Stack spacing={2} sx={{ width: "100%", minWidth: 0 }}>
          <Box>
            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
              {displayTitle}
            </Typography>
            {request.message ? (
              <Typography
                variant="body2"
                sx={{
                  color: "text.secondary",
                  whiteSpace: "pre-wrap",
                  mt: 0.5,
                }}
              >
                {request.message}
              </Typography>
            ) : null}
          </Box>

          {request.method === "select" ? (
            isSelectingCustomResponse ? (
              <PendingCustomResponseInput
                placeholder={request.placeholder}
                draft={draft}
                onDraftChange={setDraft}
                onSubmit={handleSubmit}
                onBack={handleBackToOptions}
                onCancel={() => void onCancel()}
              />
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
                        slotProps={{
                          primary: { variant: "body2" },
                          secondary: { variant: "caption", color: "text.secondary" },
                        }}
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
                        slotProps={{ primary: { variant: "body2" } }}
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
              <PendingCustomResponseInput
                placeholder={request.placeholder}
                draft={draft}
                onDraftChange={setDraft}
                onSubmit={handleSubmit}
                onBack={handleBackToOptions}
                onCancel={() => void onCancel()}
              />
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
                          slotProps={{
                            primary: { variant: "body2" },
                            secondary: { variant: "caption", color: "text.secondary" },
                          }}
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
                        slotProps={{ primary: { variant: "body2" } }}
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

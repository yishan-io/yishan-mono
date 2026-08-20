import { Box, Button, Stack, SvgIcon, Tooltip, Typography } from "@mui/material";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { normalizeKeysString } from "../../../../shortcuts/customKeybindings";
import { HotkeyDisplay } from "./KeybindingDisplay";
import { toComboFromKeyboardEvent, toDisplayKeysForCombo } from "./keyComboParsing";

type KeybindingRowProps = {
  id: string;
  descriptionKey: string;
  scopeLabel: string;
  displayKeys: readonly string[];
  hasOverride: boolean;
  hasCommittedConflict: boolean;
  conflictKeys: string | undefined;
  hasPendingConflict: boolean;
  isEditing: boolean;
  capturedKeys: readonly string[] | null;
  isCapturedConflict: boolean;
  isEditingInvalid: boolean;
  pendingConflictTooltip: string;
  captureConflictTooltip: string;
  captureBoxRef: RefObject<HTMLDivElement | null>;
  onEditKey: (combo: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onRemap: () => void;
  onReset: () => void;
};

function WarningIcon({ fontSize = "small" }: { fontSize?: "small" | "inherit" }) {
  return (
    <SvgIcon fontSize={fontSize} sx={{ color: "warning.main" }} viewBox="0 0 24 24">
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </SvgIcon>
  );
}

/** One keybinding settings row: action, current keys, and override controls. */
export function KeybindingRow({
  id,
  descriptionKey,
  scopeLabel,
  displayKeys,
  hasOverride,
  hasCommittedConflict,
  conflictKeys,
  hasPendingConflict,
  isEditing,
  capturedKeys,
  isCapturedConflict,
  isEditingInvalid,
  pendingConflictTooltip,
  captureConflictTooltip,
  captureBoxRef,
  onEditKey,
  onSave,
  onCancel,
  onRemap,
  onReset,
}: KeybindingRowProps) {
  const { t } = useTranslation();

  return (
    <Box
      key={id}
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1.4fr 1fr 1fr" },
        gap: 1,
        alignItems: "center",
        px: 1.5,
        py: 1.2,
        borderBottom: 1,
        borderColor: "divider",
      }}
    >
      <Box>
        <Typography
          variant="body2"
          sx={{
            color: "text.primary",
          }}
        >
          {t(descriptionKey)}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
          }}
        >
          {scopeLabel}
        </Typography>
        {hasCommittedConflict ? (
          <Typography
            variant="caption"
            sx={{
              color: "warning.main",
              display: "block",
            }}
          >
            {t("keybindings.conflictWith", { keys: conflictKeys })}
          </Typography>
        ) : null}
      </Box>
      <Stack
        direction="row"
        spacing={0.5}
        sx={{
          alignItems: "center",
        }}
      >
        <HotkeyDisplay keys={displayKeys} />
        {hasPendingConflict ? (
          <Tooltip title={pendingConflictTooltip} placement="top">
            <WarningIcon />
          </Tooltip>
        ) : null}
      </Stack>
      {isEditing ? (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            alignItems: "center",
          }}
        >
          <Box
            component="button"
            type="button"
            ref={captureBoxRef}
            aria-label={t("keybindings.inputHint")}
            sx={{
              minWidth: 180,
              border: 1,
              borderColor: isCapturedConflict ? "warning.main" : isEditingInvalid ? "error.main" : "divider",
              borderRadius: 1,
              px: 1,
              py: 0.75,
              bgcolor: "background.paper",
              outline: "none",
            }}
            onKeyDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const combo = toComboFromKeyboardEvent(event);
              if (!combo) {
                return;
              }

              onEditKey(combo);
            }}
          >
            {capturedKeys ? (
              <Stack
                direction="row"
                spacing={0.5}
                sx={{
                  alignItems: "center",
                }}
              >
                <HotkeyDisplay keys={capturedKeys} />
                {isCapturedConflict ? (
                  <Tooltip title={captureConflictTooltip} placement="top">
                    <WarningIcon />
                  </Tooltip>
                ) : null}
              </Stack>
            ) : (
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                }}
              >
                {t("keybindings.inputHint")}
              </Typography>
            )}
          </Box>
          <Button size="small" onClick={onSave}>
            {t("common.actions.save")}
          </Button>
          <Button size="small" onClick={onCancel}>
            {t("common.actions.cancel")}
          </Button>
        </Stack>
      ) : (
        <Stack direction="row" spacing={1}>
          <Button size="small" onClick={onRemap}>
            {t("keybindings.remap")}
          </Button>
          <Button size="small" disabled={!hasOverride} onClick={onReset}>
            {t("keybindings.reset")}
          </Button>
        </Stack>
      )}
    </Box>
  );
}

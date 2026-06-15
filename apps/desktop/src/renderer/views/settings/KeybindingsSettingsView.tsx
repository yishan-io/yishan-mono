import { Alert, Box, Button, Stack, SvgIcon, Tooltip, Typography } from "@mui/material";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HotkeyDisplay } from "../../components/KeybindingDisplay";
import { SettingsSectionHeader } from "../../components/settings";
import { getRendererPlatform } from "../../helpers/platform";
import { detectShortcutConflicts, normalizeKeysString } from "../../shortcuts/customKeybindings";
import { getShortcutDefinitions, getSupportedKeyBindings } from "../../shortcuts/keybindings";
import { keybindingSettingsStore } from "../../store/settings/keybindingSettingsStore";

type EditingState = {
  shortcutId: string;
  keys: string;
};

function WarningIcon({ fontSize = "small" }: { fontSize?: "small" | "inherit" }) {
  return (
    <SvgIcon fontSize={fontSize} sx={{ color: "warning.main" }} viewBox="0 0 24 24">
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </SvgIcon>
  );
}

function toComboFromKeyboardEvent(event: ReactKeyboardEvent<HTMLElement>): string | undefined {
  const code = event.code;
  let rawKeyFromCode: string | undefined;
  if (code.startsWith("Key") && code.length === 4) {
    rawKeyFromCode = code.slice(3).toLowerCase();
  } else if (code.startsWith("Digit") && code.length === 6) {
    rawKeyFromCode = code.slice(5);
  } else if (code === "Slash") {
    rawKeyFromCode = "/";
  } else if (code === "Backslash") {
    rawKeyFromCode = "\\";
  } else if (code === "Backspace") {
    rawKeyFromCode = "backspace";
  } else if (code === "Delete") {
    rawKeyFromCode = "delete";
  } else if (code === "Escape") {
    rawKeyFromCode = "esc";
  }

  const rawKey = (rawKeyFromCode ?? event.key).toLowerCase();
  if (["control", "meta", "shift", "alt"].includes(rawKey)) {
    return undefined;
  }

  const key = rawKey === "escape" ? "esc" : rawKey;
  const modifiers: string[] = [];
  if (event.ctrlKey) {
    modifiers.push("ctrl");
  }
  if (event.metaKey) {
    modifiers.push("command");
  }
  if (event.shiftKey) {
    modifiers.push("shift");
  }
  if (event.altKey) {
    modifiers.push("alt");
  }

  return [...modifiers, key].join("+");
}

function toComboFromNativeKeyboardEvent(event: KeyboardEvent): string | undefined {
  const rawKey = event.key;
  const syntheticEvent = {
    code: event.code,
    key: rawKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    altKey: event.altKey,
  } as ReactKeyboardEvent<HTMLElement>;

  return toComboFromKeyboardEvent(syntheticEvent);
}

function toDisplayKeyToken(token: string): string {
  if (token === "command") {
    return "⌘";
  }
  if (token === "ctrl") {
    return "CTRL";
  }
  if (token === "shift") {
    return "⇧";
  }
  if (token === "alt") {
    return "ALT";
  }
  if (token === "esc") {
    return "ESC";
  }
  if (token === "backspace" || token === "delete") {
    return "DELETE/BACKSPACE";
  }

  return token.toUpperCase();
}

function toDisplayKeysForCombo(combo: string): readonly string[] {
  const tokens = combo
    .split("+")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0);
  if (tokens.length === 0) {
    return [];
  }

  return tokens.map(toDisplayKeyToken);
}

export function KeybindingsSettingsView() {
  const { t } = useTranslation();
  const platform = getRendererPlatform();
  const overridesById = keybindingSettingsStore((state) => state.overridesById);
  const setOverride = keybindingSettingsStore((state) => state.setOverride);
  const resetOverride = keybindingSettingsStore((state) => state.resetOverride);
  const resetAllOverrides = keybindingSettingsStore((state) => state.resetAllOverrides);
  const setCaptureActive = keybindingSettingsStore((state) => state.setCaptureActive);
  const [editingState, setEditingState] = useState<EditingState | null>(null);
  const captureBoxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const active = Boolean(editingState);
    setCaptureActive(active);

    return () => {
      setCaptureActive(false);
    };
  }, [editingState, setCaptureActive]);

  useEffect(() => {
    if (!editingState) {
      return;
    }

    captureBoxRef.current?.focus();
  }, [editingState]);

  useEffect(() => {
    if (!editingState) {
      return;
    }

    const handleGlobalKeyCapture = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const combo = toComboFromNativeKeyboardEvent(event);
      if (!combo) {
        return;
      }

      setEditingState((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          keys: combo,
        };
      });
    };

    window.addEventListener("keydown", handleGlobalKeyCapture, true);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyCapture, true);
    };
  }, [editingState]);

  const definitions = useMemo(() => getShortcutDefinitions(overridesById), [overridesById]);
  const supportedBindings = useMemo(() => getSupportedKeyBindings(overridesById), [overridesById]);
  const conflicts = useMemo(() => detectShortcutConflicts(definitions), [definitions]);
  const conflictByShortcutId = useMemo(() => {
    const next = new Map<string, string>();
    for (const conflict of conflicts) {
      for (const shortcutId of conflict.shortcutIds) {
        next.set(shortcutId, conflict.keys);
      }
    }

    return next;
  }, [conflicts]);

  // Maps conflicting shortcut id → descriptionKey of the action whose captured key collides
  const pendingConflictMap = useMemo(() => {
    if (!editingState?.keys) {
      return new Map<string, string>();
    }

    const normalized = normalizeKeysString(editingState.keys);
    if (!normalized) {
      return new Map<string, string>();
    }

    const pendingCombos = new Set(normalized.split(","));
    // descriptionKey of the action being edited (the "source")
    const editingDescKey =
      definitions.find((d) => d.id === editingState.shortcutId)?.descriptionKey ?? editingState.shortcutId;

    const result = new Map<string, string>();
    for (const definition of definitions) {
      if (definition.id === editingState.shortcutId) {
        continue;
      }

      const existingCombos = normalizeKeysString(definition.keys);
      if (!existingCombos) {
        continue;
      }

      const hasOverlap = existingCombos.split(",").some((combo) => pendingCombos.has(combo));
      if (hasOverlap) {
        // The other row gets the editing action's name as the conflict source
        result.set(definition.id, editingDescKey);
      }
    }

    return result;
  }, [editingState, definitions]);

  // Flat set for quick existence checks
  const pendingConflictIds = useMemo(() => new Set(pendingConflictMap.keys()), [pendingConflictMap]);

  // Names of all actions conflicting with the currently captured key (for capture-box tooltip)
  const captureConflictNames = useMemo(() => {
    if (!editingState?.keys || pendingConflictMap.size === 0) {
      return [];
    }

    return Array.from(pendingConflictMap.keys())
      .map((id) => definitions.find((d) => d.id === id)?.descriptionKey)
      .filter((key): key is string => Boolean(key));
  }, [editingState, pendingConflictMap, definitions]);

  const isEditingInvalid = editingState ? !normalizeKeysString(editingState.keys) : false;

  return (
    <Stack spacing={2.5}>
      <SettingsSectionHeader title={t("keybindings.title")} description={t("keybindings.subtitle")} />

      {conflicts.length > 0 ? <Alert severity="warning">{t("keybindings.conflictWarning")}</Alert> : null}

      <Stack direction="row" justifyContent="flex-end">
        <Button size="small" variant="outlined" onClick={resetAllOverrides}>
          {t("keybindings.resetAll")}
        </Button>
      </Stack>

      <Box
        sx={{ border: 1, borderColor: "divider", borderRadius: 1.5, overflow: "hidden", bgcolor: "background.default" }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1.4fr 1fr 1fr" },
            gap: 1,
            px: 1.5,
            py: 1,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {t("keybindings.columns.action")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("keybindings.columns.current")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("keybindings.columns.override")}
          </Typography>
        </Box>

        {supportedBindings.map((binding) => {
          const displayKeys = platform === "darwin" ? binding.macKeys : binding.windowsKeys;
          const hasOverride = Boolean(overridesById[binding.id]);
          const hasCommittedConflict = conflictByShortcutId.has(binding.id);
          const hasPendingConflict = pendingConflictIds.has(binding.id);
          const isEditing = editingState?.shortcutId === binding.id;
          const capturedKeys = isEditing && editingState.keys ? toDisplayKeysForCombo(editingState.keys) : null;
          const isCapturedConflict =
            isEditing && editingState.keys
              ? Boolean(normalizeKeysString(editingState.keys)) && pendingConflictIds.size > 0
              : false;

          // Tooltip for the row icon: "Conflicts with: <editing action name>"
          const pendingConflictSource = hasPendingConflict ? pendingConflictMap.get(binding.id) : undefined;
          const pendingConflictTooltip = pendingConflictSource
            ? t("keybindings.pendingConflict", { action: t(pendingConflictSource) })
            : "";

          // Tooltip for the capture box icon: "Conflicts with: A, B, ..."
          const captureConflictTooltip =
            captureConflictNames.length > 0
              ? t("keybindings.captureConflict", { actions: captureConflictNames.map((k) => t(k)).join(", ") })
              : "";

          return (
            <Box
              key={binding.id}
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
                <Typography variant="body2" color="text.primary">
                  {t(binding.descriptionKey)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {binding.scope === "global" ? t("keybindings.scope.global") : t("keybindings.scope.workspace")}
                </Typography>
                {hasCommittedConflict ? (
                  <Typography variant="caption" color="warning.main" sx={{ display: "block" }}>
                    {t("keybindings.conflictWith", { keys: conflictByShortcutId.get(binding.id) })}
                  </Typography>
                ) : null}
              </Box>

              <Stack direction="row" spacing={0.5} alignItems="center">
                <HotkeyDisplay keys={displayKeys} />
                {hasPendingConflict ? (
                  <Tooltip title={pendingConflictTooltip} placement="top">
                    <WarningIcon />
                  </Tooltip>
                ) : null}
              </Stack>

              {isEditing ? (
                <Stack direction="row" spacing={1} alignItems="center">
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

                      setEditingState({ shortcutId: binding.id, keys: combo });
                    }}
                  >
                    {capturedKeys ? (
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <HotkeyDisplay keys={capturedKeys} />
                        {isCapturedConflict ? (
                          <Tooltip title={captureConflictTooltip} placement="top">
                            <WarningIcon />
                          </Tooltip>
                        ) : null}
                      </Stack>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        {t("keybindings.inputHint")}
                      </Typography>
                    )}
                  </Box>
                  <Button
                    size="small"
                    onClick={() => {
                      const normalized = normalizeKeysString(editingState.keys);
                      if (!normalized) {
                        return;
                      }

                      setOverride(binding.id, normalized);
                      setEditingState(null);
                    }}
                  >
                    {t("common.actions.save")}
                  </Button>
                  <Button size="small" onClick={() => setEditingState(null)}>
                    {t("common.actions.cancel")}
                  </Button>
                </Stack>
              ) : (
                <Stack direction="row" spacing={1}>
                  <Button
                    size="small"
                    onClick={() => {
                      setEditingState({ shortcutId: binding.id, keys: "" });
                    }}
                  >
                    {t("keybindings.remap")}
                  </Button>
                  <Button size="small" disabled={!hasOverride} onClick={() => resetOverride(binding.id)}>
                    {t("keybindings.reset")}
                  </Button>
                </Stack>
              )}
            </Box>
          );
        })}
      </Box>
    </Stack>
  );
}

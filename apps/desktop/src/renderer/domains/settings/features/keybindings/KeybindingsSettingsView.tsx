import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { getRendererPlatform } from "@renderer/platform/platform";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { keybindingSettingsStore } from "../../../../domains/settings/state/keybindingSettingsStore";
import { detectShortcutConflicts, normalizeKeysString } from "../../../../shortcuts/customKeybindings";
import { getShortcutDefinitions, getSupportedKeyBindings } from "../../../../shortcuts/keybindings";
import { SettingsSectionHeader } from "../../../../ui/components/SettingsPrimitives";
import { KeybindingRow } from "./KeybindingRow";
import { toComboFromNativeKeyboardEvent, toDisplayKeysForCombo } from "./keyComboParsing";

type EditingState = {
  shortcutId: string;
  keys: string;
};

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
      <Stack
        direction="row"
        sx={{
          justifyContent: "flex-end",
        }}
      >
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
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
            }}
          >
            {t("keybindings.columns.action")}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
            }}
          >
            {t("keybindings.columns.current")}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
            }}
          >
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
            <KeybindingRow
              key={binding.id}
              id={binding.id}
              descriptionKey={binding.descriptionKey}
              scopeLabel={
                binding.scope === "global" ? t("keybindings.scope.global") : t("keybindings.scope.workspace")
              }
              displayKeys={displayKeys}
              hasOverride={hasOverride}
              hasCommittedConflict={hasCommittedConflict}
              conflictKeys={conflictByShortcutId.get(binding.id)}
              hasPendingConflict={hasPendingConflict}
              isEditing={isEditing}
              capturedKeys={capturedKeys}
              isCapturedConflict={isCapturedConflict}
              isEditingInvalid={isEditingInvalid}
              pendingConflictTooltip={pendingConflictTooltip}
              captureConflictTooltip={captureConflictTooltip}
              captureBoxRef={captureBoxRef}
              onEditKey={(combo) => setEditingState({ shortcutId: binding.id, keys: combo })}
              onSave={() => {
                if (!editingState) {
                  return;
                }
                const normalized = normalizeKeysString(editingState.keys);
                if (!normalized) {
                  return;
                }

                setOverride(binding.id, normalized);
                setEditingState(null);
              }}
              onCancel={() => setEditingState(null)}
              onRemap={() => setEditingState({ shortcutId: binding.id, keys: "" })}
              onReset={() => resetOverride(binding.id)}
            />
          );
        })}
      </Box>
    </Stack>
  );
}

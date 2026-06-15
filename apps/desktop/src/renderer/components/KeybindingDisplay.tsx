import { Box, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { getRendererPlatform } from "../helpers/platform";
import type { SupportedKeyBinding } from "../shortcuts/keybindings";

const LARGE_SYMBOL_KEYS = new Set(["⌘", "⇧", "⌃", "⌥", "↵"]);

/**
 * Renders a horizontal sequence of keyboard keys with visual `<kbd>` styling.
 *
 * @example
 * ```tsx
 * <HotkeyDisplay keys={["Cmd", "Shift", "P"]} />
 * ```
 */
export function HotkeyDisplay({ keys }: { keys: readonly string[] }) {
  return (
    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap alignItems="center">
      {keys.map((key, index) => (
        <Stack key={key} direction="row" spacing={0.5} alignItems="center">
          {index > 0 ? (
            <Typography variant="body2" color="text.secondary" aria-hidden="true" sx={{ fontSize: 14 }}>
              +
            </Typography>
          ) : null}
          <Box
            component="kbd"
            sx={{
              px: 0.75,
              py: 0.3,
              height: 22,
              borderRadius: 0.5,
              border: 1,
              borderColor: "divider",
              bgcolor: "background.paper",
              typography: "caption",
              fontFamily: "monospace",
              lineHeight: 1.2,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <Box component="span" sx={LARGE_SYMBOL_KEYS.has(key) ? { fontSize: 14, fontWeight: 600 } : undefined}>
              {key}
            </Box>
          </Box>
        </Stack>
      ))}
    </Stack>
  );
}

export type KeybindingRowProps = {
  binding: SupportedKeyBinding;
};

/**
 * Renders one keybinding row with action description, scope label, and platform-aware key display.
 *
 * @example
 * ```tsx
 * {SUPPORTED_KEY_BINDINGS.map((binding) => (
 *   <KeybindingRow key={binding.id} binding={binding} />
 * ))}
 * ```
 */
export function KeybindingRow({ binding }: KeybindingRowProps) {
  const { t } = useTranslation();
  const platform = getRendererPlatform();
  const keys = platform === "darwin" ? binding.macKeys : binding.windowsKeys;

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1.4fr 1fr" },
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
      </Box>
      <HotkeyDisplay keys={keys} />
    </Box>
  );
}

export type KeybindingTableProps = {
  bindings: readonly SupportedKeyBinding[];
  actionColumnLabel: string;
  keyColumnLabel: string;
};

/**
 * Renders a full keybinding table with header and rows.
 *
 * @example
 * ```tsx
 * <KeybindingTable
 *   bindings={SUPPORTED_KEY_BINDINGS}
 *   actionColumnLabel={t("keybindings.columns.action")}
 *   keyColumnLabel={t("keybindings.columns.current")}
 * />
 * ```
 */
export function KeybindingTable({ bindings, actionColumnLabel, keyColumnLabel }: KeybindingTableProps) {
  return (
    <Box
      sx={{
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        overflow: "hidden",
        bgcolor: "background.default",
      }}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1.4fr 1fr" },
          gap: 1,
          px: 1.5,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {actionColumnLabel}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {keyColumnLabel}
        </Typography>
      </Box>
      {bindings.map((binding) => (
        <KeybindingRow key={binding.id} binding={binding} />
      ))}
    </Box>
  );
}

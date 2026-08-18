import { Box, Checkbox, Divider, Paper, Stack, Switch, Typography } from "@mui/material";
import type { ReactNode } from "react";

const SETTINGS_LAYOUT = {
  card: {
    paddingX: 2.5,
    paddingY: 1,
    borderRadius: 2,
  },
  row: {
    minHeight: 56,
  },
} as const;

type SettingsRowLabelProps = {
  title: ReactNode;
  description?: string;
};

/**
 * Renders one standardized settings row label with optional secondary description text.
 */
function SettingsRowLabel({ title, description }: SettingsRowLabelProps) {
  return (
    <Box sx={{ flex: 1, pr: 2, minWidth: 0 }}>
      <Typography variant="body2" component="div" noWrap>
        {title}
      </Typography>
      {description ? (
        <Typography
          variant="caption"
          noWrap
          sx={{
            color: "text.secondary",
            display: "block",
          }}
        >
          {description}
        </Typography>
      ) : null}
    </Box>
  );
}

type SettingsRowControlProps = {
  title: ReactNode;
  description?: string;
  control: ReactNode;
};

/**
 * Provides one shared left-label/right-control row shell for settings inputs.
 */
function SettingsRowControl({ title, description, control }: SettingsRowControlProps) {
  return (
    <Box
      sx={{
        width: "100%",
        minHeight: SETTINGS_LAYOUT.row.minHeight,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <SettingsRowLabel title={title} description={description} />
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", pl: 1, flexShrink: 0 }}>
        {control}
      </Box>
    </Box>
  );
}

export type SettingsControlRowProps = SettingsRowControlProps;

/**
 * Renders one standardized settings row with caller-provided right-side controls.
 */
export function SettingsControlRow({ title, description, control }: SettingsControlRowProps) {
  return <SettingsRowControl title={title} description={description} control={control} />;
}

export type SettingsCardProps = {
  children: ReactNode;
};

/**
 * Renders one standardized settings card container.
 */
export function SettingsCard({ children }: SettingsCardProps) {
  return (
    <Paper
      variant="outlined"
      sx={{
        px: SETTINGS_LAYOUT.card.paddingX,
        py: SETTINGS_LAYOUT.card.paddingY,
        borderRadius: SETTINGS_LAYOUT.card.borderRadius,
      }}
    >
      {children}
    </Paper>
  );
}

export type SettingsRowsProps = {
  children: ReactNode;
};

/**
 * Renders one vertically divided list of settings rows.
 */
export function SettingsRows({ children }: SettingsRowsProps) {
  return <Stack divider={<Divider flexItem />}>{children}</Stack>;
}

export type SettingsSectionHeaderProps = {
  title: ReactNode;
  description?: string;
  action?: ReactNode;
};

/**
 * Renders one section heading used above a settings card.
 */
export function SettingsSectionHeader({ title, description, action }: SettingsSectionHeaderProps) {
  return (
    <Box sx={{ px: 0.5, mb: 1 }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
          {title}
        </Typography>
        {action ? <Box className="electron-webkit-app-region-no-drag">{action}</Box> : null}
      </Box>
      {description ? (
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
          }}
        >
          {description}
        </Typography>
      ) : null}
    </Box>
  );
}

export type SettingsToggleRowProps = {
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (nextChecked: boolean) => void;
};

/**
 * Renders one standardized switch-based settings row.
 */
export function SettingsToggleRow({ title, description, checked, disabled, onChange }: SettingsToggleRowProps) {
  return (
    <Box sx={{ py: 0 }}>
      <SettingsControlRow
        title={title}
        description={description}
        control={
          <Switch
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            slotProps={{ input: { "aria-label": title, role: "switch" } }}
          />
        }
      />
    </Box>
  );
}

export type SettingsCheckboxRowProps = {
  title: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (nextChecked: boolean) => void;
};

/**
 * Renders one standardized checkbox-based settings row.
 */
export function SettingsCheckboxRow({ title, description, checked, disabled, onChange }: SettingsCheckboxRowProps) {
  return (
    <SettingsControlRow
      title={title}
      description={description}
      control={
        <Checkbox
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          slotProps={{ input: { "aria-label": title } }}
        />
      }
    />
  );
}

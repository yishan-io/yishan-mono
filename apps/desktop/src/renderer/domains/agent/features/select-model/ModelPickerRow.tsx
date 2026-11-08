import { Box, Button, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { ModelPickerOption } from "../../providers/modelPicker";

type ModelPickerRowProps = {
  option: ModelPickerOption;
  selected: boolean;
  isDefault: boolean;
  onSelect: (option: ModelPickerOption) => void;
  onSetDefault?: (option: ModelPickerOption) => void;
};

/** Model selection and an optional sibling action for the future-chat default. */
export function ModelPickerRow({ option, selected, isDefault, onSelect, onSetDefault }: ModelPickerRowProps) {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        minHeight: 32,
        bgcolor: selected ? "action.selected" : "transparent",
        "&:hover": { bgcolor: "action.hover" },
        "& .MuiButton-root.Mui-focusVisible": {
          outline: "2px solid",
          outlineColor: "primary.main",
          outlineOffset: "-2px",
        },
        "&:hover .model-default-action, &:focus-within .model-default-action": { opacity: 1 },
      }}
    >
      <Button
        size="small"
        title={option.name}
        onClick={() => onSelect(option)}
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: 32,
          justifyContent: "flex-start",
          px: 1.5,
          py: 0.25,
          borderRadius: 0,
          fontSize: 12,
          lineHeight: 1.5,
          color: selected ? "primary.main" : "text.secondary",
        }}
      >
        <Box component="span" sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {option.name}
        </Box>
      </Button>
      {onSetDefault ? (
        isDefault ? (
          <Typography variant="caption" sx={{ px: 1, color: "text.secondary", whiteSpace: "nowrap" }}>
            {t("common.modelPicker.default")}
          </Typography>
        ) : (
          <Button
            className="model-default-action"
            size="small"
            onClick={() => onSetDefault(option)}
            sx={{
              opacity: 0,
              flexShrink: 0,
              px: 1,
              fontSize: 11,
              whiteSpace: "nowrap",
              "@media (hover: none)": { opacity: 1 },
            }}
          >
            {t("common.modelPicker.setDefault")}
          </Button>
        )
      ) : null}
    </Box>
  );
}

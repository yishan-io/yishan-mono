import { Checkbox } from "@mui/material";

type LocalTaskTagOptionCheckboxProps = {
  selected: boolean;
  compact?: boolean;
};

/** Renders a tag option checkbox, hiding unchecked values until the option is hovered. */
export function LocalTaskTagOptionCheckbox({ selected, compact = false }: LocalTaskTagOptionCheckboxProps) {
  return (
    <Checkbox
      checked={selected}
      data-local-task-tag-checkbox
      size="small"
      slotProps={{ input: { "aria-hidden": true, tabIndex: -1 } }}
      sx={{
        opacity: selected ? 1 : 0,
        p: compact ? 0.5 : undefined,
        pointerEvents: "none",
        transition: "opacity 150ms ease",
        "[data-local-task-tag-option]:hover &": { opacity: 1 },
      }}
    />
  );
}

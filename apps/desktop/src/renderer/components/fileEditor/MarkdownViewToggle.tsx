import { IconButton, Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";
import { LuEye, LuPenLine } from "react-icons/lu";

export type MarkdownViewToggleProps = {
  /** Whether the markdown editor is currently in view-only mode. */
  viewOnly: boolean;
  onToggle: (viewOnly: boolean) => void;
};

/** Toolbar toggle between editing and view-only for the markdown WYSIWYG editor. */
export function MarkdownViewToggle({ viewOnly, onToggle }: MarkdownViewToggleProps) {
  const { t } = useTranslation();
  const actionLabel = viewOnly ? t("settings.appearance.markdown.edit") : t("settings.appearance.markdown.viewOnly");

  return (
    <Tooltip title={actionLabel}>
      <span>
        <IconButton
          aria-label={actionLabel}
          aria-pressed={viewOnly}
          onClick={() => {
            onToggle(!viewOnly);
          }}
          sx={{
            p: 0.375,
            borderRadius: 0.75,
          }}
          size="small"
        >
          {viewOnly ? <LuPenLine size={14} /> : <LuEye size={14} />}
        </IconButton>
      </span>
    </Tooltip>
  );
}

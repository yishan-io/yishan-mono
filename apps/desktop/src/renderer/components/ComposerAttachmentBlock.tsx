import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { LuClipboard, LuX } from "react-icons/lu";
import { getFileTreeIcon } from "./fileTreeIcons";

export type ComposerAttachment =
  | { kind: "file"; id: string; path: string; name: string; isDirectory: boolean }
  | { kind: "paste"; id: string; content: string; lineCount: number };

type ComposerAttachmentBlockProps = {
  attachment: ComposerAttachment;
  onRemove: (id: string) => void;
};

const CHIP_SX = {
  display: "inline-flex",
  alignItems: "center",
  gap: 0.5,
  px: 0.75,
  py: 0.25,
  borderRadius: 1,
  border: "1px solid",
  borderColor: "divider",
  bgcolor: "action.hover",
  maxWidth: 240,
  cursor: "default",
  userSelect: "none",
} as const;

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

/** A removable chip showing either a file reference or a pasted text block. */
export function ComposerAttachmentBlock({ attachment, onRemove }: ComposerAttachmentBlockProps) {
  if (attachment.kind === "file") {
    const icon = getFileTreeIcon(attachment.path, attachment.isDirectory);
    return (
      <Tooltip title={attachment.path} placement="top">
        <Box sx={CHIP_SX}>
          <Box component="img" src={icon} alt="" sx={{ width: 14, height: 14, flexShrink: 0 }} />
          <Typography variant="caption" noWrap sx={{ maxWidth: 160, lineHeight: 1.4, color: "text.secondary" }}>
            {attachment.name}
          </Typography>
          <IconButton
            size="small"
            onClick={() => onRemove(attachment.id)}
            aria-label="Remove file attachment"
            sx={{ p: 0, ml: 0.25, color: "text.disabled", "&:hover": { color: "text.secondary" } }}
          >
            <LuX size={12} />
          </IconButton>
        </Box>
      </Tooltip>
    );
  }

  const tooltipText = truncate(attachment.content, 500);

  return (
    <Tooltip
      title={
        <Box component="pre" sx={{ m: 0, whiteSpace: "pre-wrap", fontSize: "0.7rem" }}>
          {tooltipText}
        </Box>
      }
      placement="top"
    >
      <Box sx={CHIP_SX}>
        <LuClipboard size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
        <Typography variant="caption" sx={{ lineHeight: 1.4, color: "text.secondary" }}>
          paste {attachment.lineCount} lines
        </Typography>
        <IconButton
          size="small"
          onClick={() => onRemove(attachment.id)}
          aria-label="Remove pasted text"
          sx={{ p: 0, ml: 0.25, color: "text.disabled", "&:hover": { color: "text.secondary" } }}
        >
          <LuX size={12} />
        </IconButton>
      </Box>
    </Tooltip>
  );
}

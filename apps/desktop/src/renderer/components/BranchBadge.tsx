import { Box, Typography } from "@mui/material";
import { LuGitBranch } from "react-icons/lu";

type BranchBadgeProps = {
  name: string;
};

/** Renders a bordered rounded badge showing a branch name with a git-branch icon. */
export function BranchBadge({ name }: BranchBadgeProps) {
  return (
    <Box
      title={name}
      sx={{
        color: "text.secondary",
        flex: "1 1 0",
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        gap: 0.5,
        px: 0.625,
        py: 0.375,
        border: 1,
        borderColor: "divider",
        borderRadius: 0.75,
        boxSizing: "border-box",
      }}
    >
      <LuGitBranch size={12} color="currentColor" />
      <Typography
        variant="caption"
        component="span"
        sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
      >
        {name}
      </Typography>
    </Box>
  );
}

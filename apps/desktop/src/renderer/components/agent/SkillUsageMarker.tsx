import { Box, Typography } from "@mui/material";
import { SEMANTIC_COLOR_TOKENS } from "@yishan-io/design-tokens";
import { LuSparkles } from "react-icons/lu";

/** Displays a compact marker for an agent skill invocation. */
export function SkillUsageMarker({ skillName }: { skillName: string }) {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 0.75,
        color: (theme) => SEMANTIC_COLOR_TOKENS[theme.palette.mode].skill,
      }}
    >
      <LuSparkles size={14} />
      <Typography variant="body2">
        use skill:{" "}
        <Box component="span" sx={{ fontWeight: 600 }}>
          {skillName}
        </Box>
      </Typography>
    </Box>
  );
}

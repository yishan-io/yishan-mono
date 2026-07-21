import { Box, Typography } from "@mui/material";
import { LuSparkles } from "react-icons/lu";

/** Displays a compact marker for an agent skill invocation. */
export function SkillUsageMarker({ skillName }: { skillName: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, color: "text.secondary" }}>
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

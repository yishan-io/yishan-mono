import { Box } from "@mui/material";
import { AgentSkillsCard } from "./AgentSkillsCard";

/** Renders the dedicated skills manager settings page. */
export function SkillsSettingsView() {
  return (
    <Box data-testid="skills-settings-panel">
      <AgentSkillsCard />
    </Box>
  );
}

import { Stack } from "@mui/material";
import { AiChatProviderSettingsSection } from "./AiChatProviderSettingsSection";
import { CLIToolsSettingsView } from "./CLIToolsSettingsView";

/** Renders CLI tools and provider/model settings as sibling sections. */
export function AgentSettingsView() {
  return (
    <Stack spacing={2} data-testid="agent-settings-panel">
      <CLIToolsSettingsView />
      <AiChatProviderSettingsSection />
    </Stack>
  );
}

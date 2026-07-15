import { Stack } from "@mui/material";
import { AiChatProviderSettingsSection } from "./AiChatProviderSettingsSection";
import { CLIToolsSettingsView } from "./CLIToolsSettingsView";

type AgentSettingsViewProps = {
  focusAiChatProviders?: boolean;
};

/** Renders CLI tools and provider/model settings as sibling sections. */
export function AgentSettingsView({ focusAiChatProviders = false }: AgentSettingsViewProps) {
  return (
    <Stack spacing={2} data-testid="agent-settings-panel">
      <CLIToolsSettingsView />
      <AiChatProviderSettingsSection focusRequested={focusAiChatProviders} />
    </Stack>
  );
}

import { Stack } from "@mui/material";
import { AgentProviderSettingsView } from "./AgentProviderSettingsView";
import { CLIToolsSettingsView } from "./CLIToolsSettingsView";

type AgentSettingsViewProps = {
  focusAgentProviders?: boolean;
};

/** Renders CLI tools and provider/model settings as sibling sections. */
export function AgentSettingsView({ focusAgentProviders = false }: AgentSettingsViewProps) {
  return (
    <Stack spacing={2} data-testid="agent-settings-panel">
      <CLIToolsSettingsView />
      <AgentProviderSettingsView focusRequested={focusAgentProviders} />
    </Stack>
  );
}

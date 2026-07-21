import { Box, Typography } from "@mui/material";
import { parseSkillMessage } from "../../../helpers/agentSkillTextHelpers";
import { SkillUsageMarker } from "../SkillUsageMarker";

type UserMessageContentProps = {
  messageText: string;
};

/** Renders one user message, including compact skill-injection markers. */
export function UserMessageContent({ messageText }: UserMessageContentProps) {
  const skillMessage = parseSkillMessage(messageText);

  if (!skillMessage) {
    return (
      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
        {messageText}
      </Typography>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <SkillUsageMarker skillName={skillMessage.skillName} />
      {skillMessage.trailingContent ? (
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
          {skillMessage.trailingContent}
        </Typography>
      ) : null}
    </Box>
  );
}

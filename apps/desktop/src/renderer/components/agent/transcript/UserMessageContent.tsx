import { Box, Typography } from "@mui/material";
import { LuSparkles } from "react-icons/lu";
import { parseSkillMessage } from "../../../helpers/agentSkillTextHelpers";

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
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, color: "text.secondary" }}>
        <LuSparkles size={14} />
        <Typography variant="body2">
          use skill:{" "}
          <Box component="span" sx={{ fontWeight: 600 }}>
            {skillMessage.skillName}
          </Box>
        </Typography>
      </Box>
      {skillMessage.trailingContent ? (
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
          {skillMessage.trailingContent}
        </Typography>
      ) : null}
    </Box>
  );
}

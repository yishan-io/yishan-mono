import { IconButton } from "@mui/material";
import { LuChevronDown } from "react-icons/lu";

type AgentMessageScrollToBottomButtonProps = {
  ariaLabel: string;
  onClick: () => void;
};

/** Renders the floating control that returns a transcript to its latest message. */
export function AgentMessageScrollToBottomButton({ ariaLabel, onClick }: AgentMessageScrollToBottomButtonProps) {
  return (
    <IconButton
      data-testid="scroll-to-bottom-button"
      aria-label={ariaLabel}
      onClick={onClick}
      sx={{
        position: "absolute",
        bottom: 12,
        right: 12,
        zIndex: 1,
        backgroundColor: "background.paper",
        boxShadow: 2,
        "&:hover": { backgroundColor: "action.hover" },
      }}
    >
      <LuChevronDown size={20} />
    </IconButton>
  );
}

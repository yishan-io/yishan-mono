import { Box, Button, ClickAwayListener, Popper, Typography } from "@mui/material";
import { useEffect, useRef } from "react";
import { FloatingSurface } from "./FloatingSurface";
import type { RichComposerSlashCommand } from "./richComposerTypes";

const SLASH_COMMAND_MENU_WIDTH_PX = 620;
const SLASH_COMMAND_MENU_MAX_HEIGHT_PX = 280;

type RichComposerSlashCommandMenuProps = {
  anchorEl: HTMLElement | null;
  open: boolean;
  commands: RichComposerSlashCommand[];
  selectedCommandId?: string;
  onClose: () => void;
  onSelect: (command: RichComposerSlashCommand) => void;
};

/** Dropdown menu for slash command suggestions in the rich composer. */
export function RichComposerSlashCommandMenu({
  anchorEl,
  open,
  commands,
  selectedCommandId,
  onClose,
  onSelect,
}: RichComposerSlashCommandMenuProps) {
  const selectedCommandRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open || !selectedCommandId) {
      return;
    }

    selectedCommandRef.current?.scrollIntoView({ block: "nearest" });
  }, [open, selectedCommandId]);

  return (
    <Popper
      open={open}
      anchorEl={anchorEl}
      placement="bottom-start"
      sx={{ zIndex: 1300, width: `${SLASH_COMMAND_MENU_WIDTH_PX}px`, maxWidth: "calc(100vw - 32px)", mt: 0.5 }}
    >
      <ClickAwayListener
        onClickAway={(event) => {
          const clickTarget = event.target;
          if (anchorEl && clickTarget instanceof Node && anchorEl.contains(clickTarget)) {
            return;
          }
          onClose();
        }}
      >
        <FloatingSurface sx={{ p: 0.5, maxHeight: SLASH_COMMAND_MENU_MAX_HEIGHT_PX, overflowY: "auto" }}>
          {commands.length === 0 ? (
            <Typography color="text.secondary" variant="caption" sx={{ display: "block", px: 1, py: 0.75 }}>
              No matching commands
            </Typography>
          ) : (
            (["skill", "agent"] as const).map((category) => {
              const categoryCommands = commands.filter((command) => command.category === category);
              if (categoryCommands.length === 0) {
                return null;
              }

              return (
                <Box key={category} sx={{ py: 0.25 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ px: 1, py: 0.5, display: "block", textTransform: "uppercase", letterSpacing: 0.5 }}
                  >
                    {category === "skill" ? "Skills" : "Agents"}
                  </Typography>
                  {categoryCommands.map((command) => {
                    const isSelected = command.id === selectedCommandId;

                    return (
                      <Button
                        key={command.id}
                        ref={isSelected ? selectedCommandRef : undefined}
                        fullWidth
                        size="small"
                        aria-label={command.title}
                        aria-selected={isSelected}
                        onMouseDown={(event) => {
                          event.preventDefault();
                        }}
                        onClick={() => {
                          onSelect(command);
                        }}
                        sx={{
                          justifyContent: "flex-start",
                          px: 1,
                          py: 0.75,

                          color: isSelected ? "primary.main" : "text.primary",
                          bgcolor: isSelected ? "action.selected" : "transparent",
                          "&:hover": {
                            bgcolor: "action.hover",
                          },
                        }}
                      >
                        <Box sx={{ width: "100%", minWidth: 0, display: "flex", alignItems: "center", gap: 1.5 }}>
                          <Typography variant="body2" sx={{ flex: "0 1 auto", minWidth: 0 }}>
                            {command.title}
                          </Typography>
                          <Typography
                            variant="caption"
                            color="text.disabled"
                            noWrap
                            sx={{ minWidth: 0, flex: 1, textAlign: "left" }}
                          >
                            {command.description ?? ""}
                          </Typography>
                        </Box>
                      </Button>
                    );
                  })}
                </Box>
              );
            })
          )}
        </FloatingSurface>
      </ClickAwayListener>
    </Popper>
  );
}

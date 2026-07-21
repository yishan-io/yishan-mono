import { Box, ButtonBase, Tooltip, Typography } from "@mui/material";
import { LuChevronDown, LuChevronRight, LuCornerUpLeft, LuMinus, LuPlus } from "react-icons/lu";
import type { ProjectGitChangesSection } from "./ProjectGitChangesList.types";

type GitChangesSectionHeaderProps = {
  section: ProjectGitChangesSection;
  isCollapsed: boolean;
  readOnly: boolean;
  onToggle: () => void;
  onTrackSection?: (section: ProjectGitChangesSection) => void;
  onRevertSection?: (section: ProjectGitChangesSection) => void;
};

/** Resolves label and icon used for track/unstage actions per section. */
function getTrackActionMeta(sectionId: string) {
  if (sectionId === "staged") {
    return {
      verb: "Unstage",
      SectionIcon: LuMinus,
    };
  }

  return {
    verb: "Stage",
    SectionIcon: LuPlus,
  };
}

/** Returns whether one section should render revert actions. */
function shouldShowRevertAction(sectionId: string) {
  return sectionId !== "staged";
}

/** Resolves section-specific wording for destructive restore actions. */
function getRestoreActionVerb(sectionId: string) {
  return sectionId === "untracked" ? "Discard" : "Revert";
}

/** Renders the section header row with collapse toggle, label, and stage/revert all action buttons. */
export function GitChangesSectionHeader({
  section,
  isCollapsed,
  readOnly,
  onToggle,
  onTrackSection,
  onRevertSection,
}: GitChangesSectionHeaderProps) {
  const trackActionMeta = getTrackActionMeta(section.id);
  const showRevertAction = shouldShowRevertAction(section.id);
  const restoreActionVerb = getRestoreActionVerb(section.id);

  return (
    <Box
      sx={{
        height: 34,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        "&:hover .section-actions, &:focus-within .section-actions": {
          opacity: 1,
          pointerEvents: "auto",
        },
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", minWidth: 0 }}>
        <ButtonBase
          disableRipple
          onClick={onToggle}
          aria-label={isCollapsed ? `Expand ${section.label}` : `Collapse ${section.label}`}
          sx={{
            width: 18,
            height: 18,
            mr: 0.75,
            color: "text.secondary",
            borderRadius: 0.5,
          }}
        >
          {isCollapsed ? <LuChevronRight size={12} /> : <LuChevronDown size={12} />}
        </ButtonBase>

        <Typography variant="body2" sx={{ fontSize: 13, fontWeight: 400 }}>
          {section.label}
          <Box component="span" sx={{ ml: 1, color: "text.secondary", fontWeight: 400 }}>
            {section.files.length}
          </Box>
        </Typography>
      </Box>

      {readOnly ? null : (
        <Box
          className="section-actions"
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            color: "text.secondary",
            opacity: 0,
            pointerEvents: "none",
            transition: "opacity 0.15s ease",
          }}
        >
          {showRevertAction ? (
            <Tooltip title={`${restoreActionVerb} all`} arrow placement="top">
              <ButtonBase
                disableRipple
                aria-label={`${restoreActionVerb} ${section.label}`}
                sx={{ width: 18, height: 18, borderRadius: 0.5 }}
                onClick={() => onRevertSection?.(section)}
              >
                <LuCornerUpLeft size={12} />
              </ButtonBase>
            </Tooltip>
          ) : null}
          <Tooltip title={`${trackActionMeta.verb} all`} arrow placement="top">
            <ButtonBase
              disableRipple
              aria-label={`${trackActionMeta.verb} ${section.label}`}
              sx={{ width: 18, height: 18, borderRadius: 0.5 }}
              onClick={() => onTrackSection?.(section)}
            >
              <trackActionMeta.SectionIcon size={13} />
            </ButtonBase>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}

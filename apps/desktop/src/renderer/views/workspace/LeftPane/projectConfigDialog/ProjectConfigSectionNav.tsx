import { Box, List, ListItemButton, ListItemText } from "@mui/material";
import type { ProjectConfigSectionId } from "./projectConfigDialogConstants";

type ProjectConfigSectionNavProps = {
  activeSection: ProjectConfigSectionId;
  items: Array<{
    id: ProjectConfigSectionId;
    label: string;
  }>;
  onSelect: (sectionId: ProjectConfigSectionId) => void;
};

export function ProjectConfigSectionNav({ activeSection, items, onSelect }: ProjectConfigSectionNavProps) {
  return (
    <Box
      sx={{
        width: 220,
        borderRight: 1,
        borderColor: "divider",
        flexShrink: 0,
        py: 1,
      }}
    >
      <List dense>
        {items.map((section) => (
          <ListItemButton
            key={section.id}
            selected={activeSection === section.id}
            onClick={() => onSelect(section.id)}
            sx={{ borderRadius: 1, mx: 0.5 }}
          >
            <ListItemText primary={section.label} slotProps={{ primary: { variant: "body2" } }} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}

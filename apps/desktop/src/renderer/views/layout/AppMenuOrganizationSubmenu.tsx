import { Button, Divider, Paper, Popper, Stack, Typography } from "@mui/material";
import { LuCheck, LuPlus } from "react-icons/lu";
import type { SessionOrganization } from "../../store/sessionStore";

export interface AppMenuOrganizationSubmenuProps {
  anchorElement: HTMLElement | null;
  organizations: SessionOrganization[];
  selectedOrganizationId?: string;
  isOpen: boolean;
  translate: (key: string) => string;
  onSelectOrganization: (organizationId: string, isSelected: boolean) => void;
  onOpenCreateOrganizationDialog: () => void;
  onClose: () => void;
}

/** Renders the nested organization switcher inside the app menu. */
export function AppMenuOrganizationSubmenu({
  anchorElement,
  organizations,
  selectedOrganizationId,
  isOpen,
  translate,
  onSelectOrganization,
  onOpenCreateOrganizationDialog,
  onClose,
}: AppMenuOrganizationSubmenuProps) {
  return (
    <Popper open={isOpen} anchorEl={anchorElement} placement="right-start" disablePortal sx={{ zIndex: 1301, ml: 0.5 }}>
      <Paper
        elevation={3}
        sx={{
          p: 0.75,
          minWidth: 220,
          bgcolor: "background.default",
          border: (theme) => `1px solid ${theme.palette.divider}`,
          backgroundImage: "none",
        }}
        onMouseLeave={onClose}
      >
        <Stack spacing={0.25}>
          {organizations.length === 0 ? (
            <Typography variant="caption" color="text.secondary" sx={{ px: 1, py: 0.75 }}>
              {translate("org.menu.noOrganizations")}
            </Typography>
          ) : (
            organizations.map((organization) => {
              const isSelected = organization.id === selectedOrganizationId;

              return (
                <Button
                  key={organization.id}
                  size="small"
                  fullWidth
                  sx={{
                    justifyContent: "space-between",

                    color: isSelected ? "primary.main" : "text.secondary",
                    bgcolor: isSelected ? "action.selected" : "transparent",
                    boxShadow: isSelected ? (theme) => `inset 0 0 0 1px ${theme.palette.action.active}` : undefined,
                    "&:hover": {
                      bgcolor: "action.hover",
                    },
                    "&:focus-visible": {
                      bgcolor: "action.hover",
                      boxShadow: (theme) => `inset 0 0 0 1px ${theme.palette.action.active}`,
                    },
                  }}
                  onClick={() => {
                    onSelectOrganization(organization.id, isSelected);
                  }}
                >
                  <Typography component="span" variant="body2">
                    {organization.name}
                  </Typography>
                  {isSelected ? <LuCheck size={14} /> : null}
                </Button>
              );
            })
          )}
          <Divider sx={{ my: 0.5 }} />
          <Button
            size="small"
            fullWidth
            startIcon={<LuPlus size={14} />}
            sx={{
              justifyContent: "flex-start",

              color: "text.secondary",
              "&:hover": {
                bgcolor: "action.hover",
              },
            }}
            onClick={onOpenCreateOrganizationDialog}
          >
            {translate("org.menu.newOrganization")}
          </Button>
        </Stack>
      </Paper>
    </Popper>
  );
}

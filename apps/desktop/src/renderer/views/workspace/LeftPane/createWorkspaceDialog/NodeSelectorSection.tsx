import { Box, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { LuCloud, LuServer } from "react-icons/lu";
import { compactSelectSx } from "../createWorkspaceHelpers";

type NodeOption = { id: string; name: string; scope: "private" | "shared"; canUse: boolean; isOnline?: boolean };

type NodeSelectorSectionProps = {
  selectedNodeId: string;
  onNodeChange: (nodeId: string) => void;
  nodes: NodeOption[];
  nodesError: string;
  isCreatingWorkspace: boolean;
};

/** Renders the node-selection control for create mode. */
export function NodeSelectorSection({
  selectedNodeId,
  onNodeChange,
  nodes,
  nodesError,
  isCreatingWorkspace,
}: NodeSelectorSectionProps) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
        Run on node
      </Typography>
      <TextField
        select
        fullWidth
        value={selectedNodeId}
        onChange={(event) => onNodeChange(event.target.value)}
        sx={compactSelectSx}
        disabled={isCreatingWorkspace || nodes.length === 0}
        slotProps={{
          select: {
            renderValue: (value) => {
              const selectedValue = typeof value === "string" ? value : "";
              const selectedNode = nodes.find((node) => node.id === selectedValue);
              return (
                <Stack direction="row" alignItems="center" gap={1}>
                  <Box component="span" sx={{ display: "inline-flex", color: "text.secondary" }}>
                    {selectedNode?.scope === "shared" ? <LuCloud size={14} /> : <LuServer size={14} />}
                  </Box>
                  <Box
                    component="span"
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      bgcolor: selectedNode?.isOnline ? "success.main" : "text.disabled",
                    }}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {selectedNode?.name ?? "Select node"}
                  </Typography>
                </Stack>
              );
            },
          },
        }}
      >
        {nodes.map((node) => (
          <MenuItem key={node.id} value={node.id} disabled={!node.canUse || !node.isOnline}>
            <Stack direction="row" alignItems="center" gap={1}>
              <Box component="span" sx={{ display: "inline-flex", color: "text.secondary" }}>
                {node.scope === "shared" ? <LuCloud size={14} /> : <LuServer size={14} />}
              </Box>
              <Box
                component="span"
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  bgcolor: node.isOnline ? "success.main" : "text.disabled",
                }}
              />
              <Typography variant="body2">{node.name}</Typography>
            </Stack>
          </MenuItem>
        ))}
      </TextField>
      {nodesError ? (
        <Typography variant="caption" color="error" sx={{ mt: 0.5, display: "block" }}>
          {nodesError}
        </Typography>
      ) : null}
    </Box>
  );
}

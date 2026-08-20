import { Box, Typography } from "@mui/material";
import type { WorkspaceCreateProgressEntry } from "@renderer/domains/workspace";
import { CreateProgressStepIcon } from "./CreateProgressStepIcon";

interface LaunchPreparingWorkspaceProps {
  progress: WorkspaceCreateProgressEntry;
}

function LaunchPreparingWorkspace({ progress }: LaunchPreparingWorkspaceProps) {
  return (
    <Box
      sx={{
        flex: 1,
        px: 3,
        py: 4,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: 2,
      }}
    >
      <Typography variant="h6">Preparing workspace</Typography>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        You can follow setup progress here while the daemon finishes provisioning.
      </Typography>
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1.25,
          width: "min(420px, 100%)",
          mt: 1,
          "@keyframes workspace-create-spin": {
            from: { transform: "rotate(0deg)" },
            to: { transform: "rotate(360deg)" },
          },
          "& .spin": { animation: "workspace-create-spin 1s linear infinite" },
        }}
      >
        {progress.steps.map((step) => (
          <Box
            key={step.id}
            sx={{
              display: "flex",
              alignItems: "flex-start",
              gap: 1.5,
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              px: 1.25,
              py: 1,
              bgcolor: "background.paper",
            }}
          >
            <Box sx={{ display: "inline-flex", mt: 0.25, color: "text.secondary" }}>
              <CreateProgressStepIcon step={step} />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2">{step.label}</Typography>
              {step.message ? (
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {step.message}
                </Typography>
              ) : null}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export { LaunchPreparingWorkspace };

import { Box } from "@mui/material";
import type { WorkspaceCreateProgressStep } from "@renderer/domains/workspace";
import { LuCircle, LuCircleCheck, LuCircleX, LuLoaderCircle, LuTriangleAlert } from "react-icons/lu";

interface CreateProgressStepIconProps {
  step: WorkspaceCreateProgressStep;
}

function CreateProgressStepIcon({ step }: CreateProgressStepIconProps) {
  if (step.status === "completed") {
    return (
      <Box component="span" sx={{ display: "inline-flex", color: "success.main" }}>
        <LuCircleCheck size={16} />
      </Box>
    );
  }

  if (step.status === "skipped") {
    return (
      <Box component="span" sx={{ display: "inline-flex", color: "text.disabled" }}>
        <LuCircleCheck size={16} />
      </Box>
    );
  }

  if (step.status === "failed") {
    return <LuCircleX size={16} color="var(--mui-palette-error-main)" />;
  }

  if (step.status === "warning") {
    return <LuTriangleAlert size={16} color="var(--mui-palette-warning-main)" />;
  }

  if (step.status === "running") {
    return (
      <Box component="span" sx={{ display: "inline-flex", color: "warning.main" }}>
        <LuLoaderCircle size={16} className="spin" />
      </Box>
    );
  }

  return <LuCircle size={16} />;
}

export { CreateProgressStepIcon };

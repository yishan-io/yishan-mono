import { Box } from "@mui/material";
import type { ReactNode } from "react";

type AppBackgroundContainerProps = {
  children: ReactNode;
};

export function AppBackgroundContainer(props: AppBackgroundContainerProps) {
  return (
    <Box
      sx={(theme) => ({
        height: "100%",
        width: "100%",
        background:
          theme.palette.mode === "dark"
            ? "radial-gradient(circle at 10% -10%, rgba(126, 190, 65, 0.14), rgba(126, 190, 65, 0) 54%), radial-gradient(circle at 82% 8%, rgba(59, 135, 47, 0.12), rgba(59, 135, 47, 0) 46%), linear-gradient(160deg, #0a110d 0%, #121a14 45%, #0b100c 100%)"
            : "radial-gradient(circle at 10% -10%, rgba(126, 190, 65, 0.10), rgba(126, 190, 65, 0) 54%), radial-gradient(circle at 82% 8%, rgba(59, 135, 47, 0.08), rgba(59, 135, 47, 0) 46%), linear-gradient(160deg, #f2f6f3 0%, #f7f9f5 45%, #f3f6f2 100%)",
      })}
    >
      {props.children}
    </Box>
  );
}

import { Box } from "@mui/material";
import { LuGlobe } from "react-icons/lu";
import type { BrowserHistoryGroup } from "../../../../main/ipc";

type BlankViewProps = {
  historyGroups: BrowserHistoryGroup[];
  onNavigateTo: (url: string) => void;
};

export function BlankView({ historyGroups, onNavigateTo }: BlankViewProps) {
  return (
    <Box
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        p: 4,
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 56,
          height: 56,
          borderRadius: "50%",
          bgcolor: "action.hover",
        }}
      >
        <LuGlobe size={24} color="text.secondary" />
      </Box>
      <Box sx={{ textAlign: "center" }}>
        <Box sx={{ fontSize: 15, fontWeight: 600, mb: 0.5, color: "text.primary" }}>Browse the web</Box>
        <Box sx={{ fontSize: 13, color: "text.secondary" }}>Enter a URL or search term in the address bar above</Box>
      </Box>
      {historyGroups.length > 0 ? (
        <Box sx={{ mt: 2, width: "100%", maxWidth: 480 }}>
          <Box
            sx={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: "text.disabled",
              mb: 1,
            }}
          >
            Recent
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25 }}>
            {historyGroups.slice(0, 3).map((group) =>
              group.entries
                .slice(-2)
                .reverse()
                .map((entry) => (
                  <Box
                    key={entry.url}
                    onClick={() => onNavigateTo(entry.url)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1.5,
                      py: 0.75,
                      px: 1.5,
                      borderRadius: 1,
                      cursor: "pointer",
                      "&:hover": { bgcolor: "action.hover" },
                    }}
                  >
                    {entry.faviconUrl || group.faviconUrl ? (
                      <Box
                        sx={{
                          width: 14,
                          height: 14,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <img
                          src={entry.faviconUrl || group.faviconUrl}
                          alt=""
                          width={14}
                          height={14}
                          style={{ objectFit: "contain" }}
                          onError={(e) => {
                            const el = e.currentTarget;
                            el.style.display = "none";
                            const fallback = el.nextElementSibling as HTMLElement;
                            if (fallback) fallback.style.display = "";
                          }}
                        />
                        <LuGlobe size={14} style={{ display: "none" }} />
                      </Box>
                    ) : (
                      <Box
                        sx={{
                          width: 14,
                          height: 14,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <LuGlobe size={14} />
                      </Box>
                    )}
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Box sx={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.title}
                      </Box>
                      <Box
                        sx={{
                          fontSize: 11,
                          color: "text.disabled",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {entry.url}
                      </Box>
                    </Box>
                  </Box>
                )),
            )}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}

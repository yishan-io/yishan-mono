import { Box, Button, Typography } from "@mui/material";
import { buildHighlightedPathSegments, splitFilePathForDisplay } from "@renderer/domains/files";
import { getFileTreeIcon } from "@renderer/domains/files";
import { useRef } from "react";
import { ComposerSuggestionMenuShell } from "./ComposerSuggestionMenuShell";
import type { FileMentionResult } from "./richComposerTypes";

const FILE_MENTION_MENU_WIDTH_PX = 480;
const FILE_MENTION_MENU_MAX_HEIGHT_PX = 280;

type RichComposerFileMentionMenuProps = {
  anchorEl: HTMLElement | null;
  open: boolean;
  results: FileMentionResult[];
  isSearching: boolean;
  hasSearchError: boolean;
  selectedResultIndex: number;
  onClose: () => void;
  onSelect: (result: FileMentionResult) => void;
};

/** Dropdown menu for @ file mention suggestions in the rich composer. */
export function RichComposerFileMentionMenu({
  anchorEl,
  open,
  results,
  isSearching,
  hasSearchError,
  selectedResultIndex,
  onClose,
  onSelect,
}: RichComposerFileMentionMenuProps) {
  const selectedResultRef = useRef<HTMLButtonElement | null>(null);

  const emptyStateText = isSearching ? "Searching files…" : hasSearchError ? "Search failed" : "No matching files";

  return (
    <ComposerSuggestionMenuShell
      anchorEl={anchorEl}
      open={open}
      widthPx={FILE_MENTION_MENU_WIDTH_PX}
      maxHeightPx={FILE_MENTION_MENU_MAX_HEIGHT_PX}
      selectedItemRef={selectedResultRef}
      selectedItemKey={results[selectedResultIndex]?.path}
      onClose={onClose}
    >
      {results.length === 0 ? (
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            display: "block",
            px: 1,
            py: 0.75,
          }}
        >
          {emptyStateText}
        </Typography>
      ) : (
        results.map((result, index) => {
          const isSelected = index === selectedResultIndex;
          const pathParts = splitFilePathForDisplay(result.path);
          const filenameHighlightIndexes = result.highlightedPathIndexes
            .filter((highlightedIndex) => highlightedIndex >= pathParts.filenameStart)
            .map((highlightedIndex) => highlightedIndex - pathParts.filenameStart);
          const directoryHighlightIndexes = result.highlightedPathIndexes.filter(
            (highlightedIndex) => highlightedIndex < pathParts.filenameStart,
          );
          const filenameSegments = buildHighlightedPathSegments(pathParts.filename, filenameHighlightIndexes);
          const directorySegments = buildHighlightedPathSegments(pathParts.directory, directoryHighlightIndexes);

          return (
            <Button
              key={result.path}
              ref={isSelected ? selectedResultRef : undefined}
              fullWidth
              size="small"
              aria-label={result.path}
              aria-selected={isSelected}
              onMouseDown={(event) => {
                event.preventDefault();
              }}
              onClick={() => {
                onSelect(result);
              }}
              sx={{
                justifyContent: "flex-start",
                px: 1,
                py: 0.5,
                color: isSelected ? "primary.main" : "text.primary",
                bgcolor: isSelected ? "action.selected" : "transparent",
                "&:hover": {
                  bgcolor: "action.hover",
                },
              }}
            >
              <Box sx={{ width: "100%", minWidth: 0, display: "flex", alignItems: "center", gap: 1.5 }}>
                <Box
                  component="img"
                  src={getFileTreeIcon(result.path, result.isDirectory ?? result.path.endsWith("/"))}
                  alt=""
                  sx={{ width: 16, height: 16, flexShrink: 0 }}
                />
                <Box sx={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 0.75 }}>
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {filenameSegments.map((segment, segmentIndex) => (
                      <Box
                        key={`${result.path}-filename-segment-${segmentIndex}`}
                        component="span"
                        data-highlighted={segment.highlighted ? "true" : "false"}
                        sx={{
                          fontWeight: segment.highlighted ? 600 : 500,
                        }}
                      >
                        {segment.text}
                      </Box>
                    ))}
                  </Typography>
                  {pathParts.directory ? (
                    <Typography
                      component="span"
                      variant="caption"
                      sx={{ color: "text.secondary", whiteSpace: "nowrap", flexShrink: 0 }}
                    >
                      {directorySegments.map((segment, segmentIndex) => (
                        <Box
                          key={`${result.path}-directory-segment-${segmentIndex}`}
                          component="span"
                          data-highlighted={segment.highlighted ? "true" : "false"}
                          sx={{
                            color: segment.highlighted ? "text.primary" : "text.secondary",
                            fontWeight: segment.highlighted ? 600 : 400,
                          }}
                        >
                          {segment.text}
                        </Box>
                      ))}
                    </Typography>
                  ) : null}
                </Box>
              </Box>
            </Button>
          );
        })
      )}
    </ComposerSuggestionMenuShell>
  );
}

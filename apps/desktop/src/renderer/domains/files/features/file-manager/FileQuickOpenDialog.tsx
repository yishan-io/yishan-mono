import { Box, Dialog, DialogContent, InputAdornment, TextField, Typography } from "@mui/material";
import { type KeyboardEvent as ReactKeyboardEvent, useRef } from "react";
import { BiSearch } from "react-icons/bi";
import type { FileSearchResult } from "../../../../search/fileSearch";
import { useDialogRegistration } from "../../../../domains/workbench";
import { buildHighlightedPathSegments, splitFilePathForDisplay } from "../../ui/filePathDisplayHelpers";
import { getFileTreeIcon } from "../../ui/fileTreeIcons";

type FileQuickOpenDialogProps = {
  open: boolean;
  query: string;
  selectedResultIndex: number;
  results: FileSearchResult[];
  placeholder: string;
  emptyText: string;
  onClose: () => void;
  onQueryChange: (nextQuery: string) => void;
  onInputKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onSelectResultIndex: (index: number) => void;
  onOpenResult: (path: string, index: number) => void;
};

/**
 * Renders the workspace quick-open dialog with fuzzy file results and highlighted path segments.
 */
export function FileQuickOpenDialog({
  open,
  query,
  selectedResultIndex,
  results,
  placeholder,
  emptyText,
  onClose,
  onQueryChange,
  onInputKeyDown,
  onSelectResultIndex,
  onOpenResult,
}: FileQuickOpenDialogProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const hasQuery = query.trim().length > 0;
  const hasResults = results.length > 0;
  useDialogRegistration(open);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      sx={{
        "& .MuiDialog-container": {
          alignItems: "flex-start",
        },
      }}
      slotProps={{
        paper: {
          "data-testid": "file-quick-open-dialog-paper",
          style: {
            marginTop: "48px",
            width: "500px",
            maxWidth: "calc(100% - 64px)",
            maxHeight: "calc(100% - 96px)",
          },
        } as Record<string, unknown>,
        transition: {
          onEntered: () => {
            searchInputRef.current?.focus();
          },
        },
      }}
    >
      <DialogContent sx={{ px: 1, py: 0.5 }}>
        <TextField
          autoFocus
          inputRef={searchInputRef}
          fullWidth
          value={query}
          placeholder={placeholder}
          sx={{
            "& .MuiOutlinedInput-root": {
              px: 0,
            },
            "& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline": {
              border: "none",
            },
            "& .MuiInputAdornment-root": {
              marginRight: 0,
            },
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <BiSearch size={14} />
                </InputAdornment>
              ),
            },
            htmlInput: {
              "aria-label": placeholder,
              onKeyDown: onInputKeyDown,
              style: {
                fontSize: "14px",
                paddingLeft: "4px",
                paddingRight: 0,
                paddingTop: "8px",
                paddingBottom: "8px",
              },
            },
          }}
          onChange={(event) => {
            onQueryChange(event.target.value);
          }}
        />
        {!hasQuery ? null : !hasResults ? (
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mt: 1,
              px: 1,
              py: 1.5,
            }}
          >
            {emptyText}
          </Typography>
        ) : (
          <Box
            data-testid="file-quick-open-results"
            sx={{
              mt: 1,
              maxHeight: 360,
              overflowY: "auto",
              bgcolor: "background.paper",
            }}
          >
            {results.map((result, index) => {
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
                <Box
                  key={result.path}
                  component="button"
                  type="button"
                  aria-label={result.path}
                  onMouseEnter={() => onSelectResultIndex(index)}
                  onClick={() => {
                    onOpenResult(result.path, index);
                  }}
                  sx={{
                    width: "100%",
                    textAlign: "left",
                    px: 1,
                    py: 0.5,
                    border: 0,
                    cursor: "pointer",
                    bgcolor: selectedResultIndex === index ? "action.hover" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    minHeight: 40,
                  }}
                >
                  <Box
                    component="img"
                    src={getFileTreeIcon(result.path, result.path.endsWith("/"))}
                    alt=""
                    sx={{ width: 16, height: 16, flexShrink: 0 }}
                  />
                  <Box sx={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 0.75 }}>
                    <Typography
                      component="span"
                      variant="body2"
                      sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {filenameSegments.map((segment, segmentIndex) => (
                        <Box
                          key={`${result.path}-filename-segment-${segmentIndex}`}
                          component="span"
                          data-highlighted={segment.highlighted ? "true" : "false"}
                          sx={{
                            color: "text.primary",
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
              );
            })}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

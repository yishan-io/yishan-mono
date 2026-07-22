import { Box, InputAdornment, ListSubheader, MenuItem, Tab, Tabs, TextField, Tooltip, Typography } from "@mui/material";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuFolderGit2, LuGitBranch, LuSearch } from "react-icons/lu";

export type BranchDropdownGroups = {
  localBranches: string[];
  worktreeBranches: string[];
  remoteBranches: string[];
};

type BranchDropdownProps = {
  groups: BranchDropdownGroups;
  selectedValue: string;
  onSelect: (value: string) => void;
  localLabel: string;
  branchesLabel: string;
  worktreesLabel: string;
  remoteLabel: string;
  emptyLocalLabel: string;
  emptyWorktreeLabel: string;
  emptyRemoteLabel: string;
};

type FlatRow =
  | { type: "header"; key: string; label: string }
  | { type: "option"; key: string; value: string; label: string; indent: number; kind: "branch" | "worktree" };

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 28;
const MAX_LIST_HEIGHT = 320;
const OVERSCAN = 10;

function matchBranch(branch: string, query: string): boolean {
  if (!query) return true;
  return branch.toLowerCase().includes(query);
}

function buildSectionRows(
  branches: string[],
  prefix: string,
  indent: number,
  kind: "branch" | "worktree",
  query: string,
): FlatRow[] {
  const filtered = query ? branches.filter((b) => matchBranch(b, query)) : branches;
  if (filtered.length === 0) {
    return [];
  }
  return filtered.map((branch) => ({
    type: "option" as const,
    key: `${prefix}-${branch}`,
    value: branch,
    label: branch,
    indent,
    kind,
  }));
}

function buildFlatRows(
  activeSection: "local" | "remote",
  groups: BranchDropdownGroups,
  query: string,
  branchesLabel: string,
  worktreesLabel: string,
  emptyLocalLabel: string,
  emptyWorktreeLabel: string,
  emptyRemoteLabel: string,
): FlatRow[] {
  const rows: FlatRow[] = [];
  const trimmedQuery = query.trim().toLowerCase();

  if (activeSection === "local") {
    const localRows = buildSectionRows(groups.localBranches, "local", 4, "branch", trimmedQuery);
    const worktreeRows = buildSectionRows(groups.worktreeBranches, "worktree", 4, "worktree", trimmedQuery);

    rows.push({ type: "header", key: "local-header", label: branchesLabel });
    if (localRows.length > 0) {
      rows.push(...localRows);
    } else {
      rows.push({ type: "option", key: "local-empty", value: "", label: emptyLocalLabel, indent: 4, kind: "branch" });
    }

    rows.push({ type: "header", key: "worktree-header", label: worktreesLabel });
    if (worktreeRows.length > 0) {
      rows.push(...worktreeRows);
    } else {
      rows.push({
        type: "option",
        key: "worktree-empty",
        value: "",
        label: emptyWorktreeLabel,
        indent: 4,
        kind: "worktree",
      });
    }
  } else {
    const remoteRows = buildSectionRows(groups.remoteBranches, "remote", 2, "branch", trimmedQuery);
    if (remoteRows.length > 0) {
      rows.push(...remoteRows);
    } else {
      rows.push({ type: "option", key: "remote-empty", value: "", label: emptyRemoteLabel, indent: 2, kind: "branch" });
    }
  }

  return rows;
}

export function BranchDropdown({
  groups,
  selectedValue,
  onSelect,
  localLabel,
  branchesLabel,
  worktreesLabel,
  remoteLabel,
  emptyLocalLabel,
  emptyWorktreeLabel,
  emptyRemoteLabel,
}: BranchDropdownProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const inferredInitialSection = useMemo<"local" | "remote">(() => {
    const remoteSet = new Set(groups.remoteBranches);
    return remoteSet.has(selectedValue) ? "remote" : "local";
  }, [groups.remoteBranches, selectedValue]);
  const [activeSection, setActiveSection] = useState<"local" | "remote">(inferredInitialSection);

  const selectedValueSet = useMemo(() => {
    const set = new Set<string>();
    set.add(selectedValue);
    return set;
  }, [selectedValue]);

  const flatRows = useMemo(
    () =>
      buildFlatRows(
        activeSection,
        groups,
        searchQuery,
        branchesLabel,
        worktreesLabel,
        emptyLocalLabel,
        emptyWorktreeLabel,
        emptyRemoteLabel,
      ),
    [
      activeSection,
      branchesLabel,
      emptyLocalLabel,
      emptyRemoteLabel,
      emptyWorktreeLabel,
      groups,
      searchQuery,
      worktreesLabel,
    ],
  );

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => (flatRows[index]?.type === "header" ? HEADER_HEIGHT : ROW_HEIGHT),
    overscan: OVERSCAN,
  });

  const handleSectionChange = useCallback((_event: unknown, nextValue: "local" | "remote") => {
    setActiveSection(nextValue);
    setSearchQuery("");
  }, []);

  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  }, []);

  useEffect(() => {
    void activeSection;
    void searchQuery;
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    virtualizer.scrollToIndex(0, { align: "start" });
  }, [activeSection, searchQuery, virtualizer]);

  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  const renderOption = useCallback(
    (row: FlatRow & { type: "option" }) => (
      <MenuItem
        selected={selectedValueSet.has(row.value)}
        onClick={() => {
          if (row.value) {
            onSelect(row.value);
          }
        }}
        sx={{ pl: row.indent, pr: 1, maxWidth: "100%", overflow: "hidden", minHeight: ROW_HEIGHT }}
        disabled={!row.value}
      >
        <Tooltip title={row.label} placement="top" enterDelay={500} enterTouchDelay={500}>
          <Box
            component="span"
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.75,
              minWidth: 0,
              width: "100%",
              maxWidth: "100%",
            }}
          >
            <Box component="span" sx={{ display: "inline-flex", flexShrink: 0 }}>
              {row.kind === "worktree" ? <LuFolderGit2 size={14} /> : <LuGitBranch size={14} />}
            </Box>
            <Typography
              variant="body2"
              noWrap
              sx={{
                display: "block",
                flex: 1,
                minWidth: 0,
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {row.label}
            </Typography>
          </Box>
        </Tooltip>
      </MenuItem>
    ),
    [onSelect, selectedValueSet],
  );

  return (
    <Box>
      <Box sx={{ px: 1, pt: 0.5 }}>
        <Tabs
          value={activeSection}
          onChange={handleSectionChange}
          variant="fullWidth"
          sx={{
            minHeight: 24,
            "& .MuiTab-root": { minHeight: 24, py: 0, textTransform: "none", fontSize: 11 },
            "& .MuiTabs-indicator": { transition: "none" },
          }}
        >
          <Tab value="local" label={localLabel} />
          <Tab value="remote" label={remoteLabel} />
        </Tabs>
      </Box>

      <Box sx={{ px: 1, py: 0.5 }}>
        <TextField
          inputRef={searchInputRef}
          fullWidth
          placeholder="Filter branches\u2026"
          value={searchQuery}
          onChange={handleSearchChange}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              setSearchQuery("");
            }
          }}
          sx={{
            "& .MuiOutlinedInput-root": { fontSize: 12, minHeight: 28, borderRadius: 1.5 },
            "& .MuiOutlinedInput-input": { py: 0.25, px: 1 },
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start" sx={{ mr: 0, ml: 0.25 }}>
                  <LuSearch size={13} />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>

      <Box ref={scrollRef} sx={{ overflowY: "auto", overflowX: "hidden", maxHeight: MAX_LIST_HEIGHT }}>
        <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const row = flatRows[virtualItem.index];
            if (!row) return null;

            if (row.type === "header") {
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <ListSubheader
                    disableSticky
                    sx={{ pl: 3, fontSize: 10, lineHeight: 1.4, textTransform: "uppercase", color: "text.disabled" }}
                  >
                    {row.label}
                  </ListSubheader>
                </div>
              );
            }

            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                {renderOption(row)}
              </div>
            );
          })}
        </div>
      </Box>
    </Box>
  );
}

import { Autocomplete, type AutocompleteRenderInputParams, Box, LinearProgress, TextField } from "@mui/material";
import { memo, useCallback, useMemo, useState } from "react";
import { LuArrowRight } from "react-icons/lu";
import { BranchBadge } from "./BranchBadge";

export type ProjectCommitComparisonFile = {
  path: string;
  oldPath?: string;
  status: string;
};

export type ProjectCommitComparisonCommit = {
  hash: string;
  shortHash: string;
  authorName: string;
  committedAt: string;
  subject: string;
  changedFiles: ProjectCommitComparisonFile[];
};

export type ProjectCommitComparisonData = {
  currentBranch: string;
  targetBranch: string;
  allChangedFiles: ProjectCommitComparisonFile[];
  commits: ProjectCommitComparisonCommit[];
};

export type ProjectCommitComparisonSelection = "uncommitted" | "all" | string;

type ProjectComparisonScopeOption = {
  value: ProjectCommitComparisonSelection;
  label: string;
};

type ProjectCommitComparisonProps = {
  comparison: ProjectCommitComparisonData;
  targetBranch: string;
  selectedComparison?: ProjectCommitComparisonSelection;
  onSelectUncommitted?: () => void;
  onSelectAll?: () => void;
  onSelectCommit?: (commit: ProjectCommitComparisonCommit) => void;
  isTargetBranchLoading?: boolean;
  comparisonScopeAriaLabel?: string;
};

/** Formats one commit timestamp as a short relative label like "5m ago". */
export function formatRelativeCommitTime(committedAt: string, nowMs = Date.now()): string {
  const committedAtMs = Date.parse(committedAt);
  if (!Number.isFinite(committedAtMs)) {
    return "";
  }

  const diffMs = Math.max(0, nowMs - committedAtMs);
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;
  const monthMs = 30 * dayMs;
  const yearMs = 365 * dayMs;

  if (diffMs < hourMs) {
    const minutes = Math.max(1, Math.floor(diffMs / minuteMs));
    return `${minutes}m ago`;
  }

  if (diffMs < dayMs) {
    const hours = Math.floor(diffMs / hourMs);
    return `${hours}h ago`;
  }

  if (diffMs < monthMs) {
    const days = Math.floor(diffMs / dayMs);
    return `${days}d ago`;
  }

  if (diffMs < yearMs) {
    const months = Math.floor(diffMs / monthMs);
    return `${months}mo ago`;
  }

  const years = Math.floor(diffMs / yearMs);
  return `${years}y ago`;
}

/** Builds compact scope options with uncommitted, aggregate, and per-commit entries. */
function buildComparisonScopeOptions(comparison: ProjectCommitComparisonData): ProjectComparisonScopeOption[] {
  const dedupedAllChangedFileCount = new Set(
    comparison.allChangedFiles.map((f) => f.path.trim().replace(/\\/g, "/")).filter((path) => path.length > 0),
  ).size;

  const scopeOptions: ProjectComparisonScopeOption[] = [
    {
      value: "uncommitted",
      label: "Uncommitted",
    },
    {
      value: "all",
      label: `All changes (${dedupedAllChangedFileCount})`,
    },
  ];

  for (const commit of comparison.commits) {
    scopeOptions.push({
      value: commit.hash,
      label: `${commit.shortHash} ${commit.subject}`,
    });
  }

  return scopeOptions;
}

const getOptionLabel = (option: ProjectComparisonScopeOption) => option.label;

const isOptionEqual = (option: ProjectComparisonScopeOption, value: ProjectComparisonScopeOption) =>
  option.value === value.value;

const listboxSlotProps = {
  sx: {
    "& .MuiAutocomplete-option": {
      minHeight: 28,
      fontSize: 12,
    },
  },
} as const;

const autocompleteSx = {
  minWidth: 0,
  mt: 1,
  "& .MuiOutlinedInput-root": {
    minHeight: 28,
    py: 0,
  },
  "& .MuiInputBase-input": {
    fontSize: 12,
  },
} as const;

/** Renders one compact current-to-target branch comparison control group in the Changes tab. */
export const ProjectCommitComparison = memo(function ProjectCommitComparison({
  comparison,
  targetBranch,
  selectedComparison,
  onSelectUncommitted,
  onSelectAll,
  onSelectCommit,
  isTargetBranchLoading = false,
  comparisonScopeAriaLabel = "Change scope",
}: ProjectCommitComparisonProps) {
  const normalizedTargetBranch = targetBranch.trim();

  const comparisonScopeOptions = useMemo(() => buildComparisonScopeOptions(comparison), [comparison]);

  const selectedScopeOption = useMemo(
    () => comparisonScopeOptions.find((option) => option.value === selectedComparison) ?? comparisonScopeOptions[0],
    [comparisonScopeOptions, selectedComparison],
  );

  const [open, setOpen] = useState(false);

  /** Handles compact scope selection and forwards it to the appropriate callback. */
  const handleSelectComparisonScope = useCallback(
    (_event: unknown, option: ProjectComparisonScopeOption | null) => {
      if (!option) {
        return;
      }

      setOpen(false);

      if (option.value === "uncommitted") {
        onSelectUncommitted?.();
        return;
      }

      if (option.value === "all") {
        onSelectAll?.();
        return;
      }

      const commit = comparison.commits.find((candidate) => candidate.hash === option.value);
      if (commit) {
        onSelectCommit?.(commit);
      }
    },
    [comparison.commits, onSelectUncommitted, onSelectAll, onSelectCommit],
  );

  const handleOpen = useCallback(() => setOpen(true), []);
  const handleClose = useCallback(() => setOpen(false), []);

  const slotProps = useMemo(
    () => ({
      listbox: listboxSlotProps,
    }),
    [],
  );

  const renderInput = useCallback(
    (params: AutocompleteRenderInputParams) => (
      <TextField
        {...params}
        placeholder={comparisonScopeAriaLabel}
        slotProps={{
          htmlInput: {
            ...params.inputProps,
            "aria-label": comparisonScopeAriaLabel,
          },
        }}
      />
    ),
    [comparisonScopeAriaLabel],
  );

  return (
    <Box sx={{ mt: 1, minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, overflow: "hidden" }}>
        <BranchBadge name={comparison.currentBranch} testId="commit-comparison-current-branch" />
        {normalizedTargetBranch ? (
          <>
            <Box sx={{ flexShrink: 0, display: "inline-flex", alignItems: "center" }}>
              <LuArrowRight size={13} color="currentColor" />
            </Box>
            <BranchBadge name={normalizedTargetBranch} testId="commit-comparison-target-branch" />
          </>
        ) : null}
      </Box>

      <Autocomplete
        size="small"
        open={open}
        onOpen={handleOpen}
        onClose={handleClose}
        options={comparisonScopeOptions}
        value={selectedScopeOption}
        disableClearable
        disableCloseOnSelect
        data-testid="commit-comparison-scope-select"
        getOptionLabel={getOptionLabel}
        isOptionEqualToValue={isOptionEqual}
        onChange={handleSelectComparisonScope}
        slotProps={slotProps}
        sx={autocompleteSx}
        renderInput={renderInput}
      />

      {isTargetBranchLoading ? (
        <Box sx={{ mt: 0.75 }}>
          <LinearProgress
            data-testid="commit-comparison-target-loading"
            sx={{ width: "100%", height: 2, borderRadius: 999, overflow: "hidden" }}
          />
        </Box>
      ) : null}
    </Box>
  );
});

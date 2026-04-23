import { Autocomplete, Box, LinearProgress, TextField, Typography } from "@mui/material";
import { LuArrowRight } from "react-icons/lu";

export type ProjectCommitComparisonCommit = {
  hash: string;
  shortHash: string;
  authorName: string;
  committedAt: string;
  subject: string;
  changedFiles: string[];
};

export type ProjectCommitComparisonData = {
  currentBranch: string;
  targetBranch: string;
  allChangedFiles: string[];
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
    comparison.allChangedFiles.map((path) => path.trim().replace(/\\/g, "/")).filter((path) => path.length > 0),
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

/** Renders one compact current-to-target branch comparison control group in the Changes tab. */
export function ProjectCommitComparison({
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
  if (!normalizedTargetBranch) {
    return null;
  }

  /** Selects one commit row so the changes list can render files for that commit. */
  const handleSelectCommit = (commit: ProjectCommitComparisonCommit) => {
    onSelectCommit?.(commit);
  };

  /** Selects the uncommitted workspace changes in the lower list. */
  const handleSelectUncommitted = () => {
    onSelectUncommitted?.();
  };

  /** Selects one aggregated view that includes all commit-file changes. */
  const handleSelectAll = () => {
    onSelectAll?.();
  };

  const comparisonScopeOptions = buildComparisonScopeOptions(comparison);
  const selectedScopeOption =
    comparisonScopeOptions.find((option) => option.value === selectedComparison) ?? comparisonScopeOptions[0];

  /** Handles compact scope selection and forwards it to the appropriate callback. */
  const handleSelectComparisonScope = (_event: unknown, option: ProjectComparisonScopeOption | null) => {
    if (!option) {
      return;
    }

    if (option.value === "uncommitted") {
      handleSelectUncommitted();
      return;
    }

    if (option.value === "all") {
      handleSelectAll();
      return;
    }

    const commit = comparison.commits.find((candidate) => candidate.hash === option.value);
    if (commit) {
      handleSelectCommit(commit);
    }
  };

  return (
    <Box sx={{ mt: 1, minWidth: 0 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, overflow: "hidden" }}>
        <Typography
          variant="caption"
          data-testid="commit-comparison-current-branch"
          title={comparison.currentBranch}
          sx={{
            color: "text.secondary",
            flex: "1 1 0",
            minWidth: 0,
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            px: 0.625,
            py: 0.375,
            border: 1,
            borderColor: "divider",
            borderRadius: 0.75,
            boxSizing: "border-box",
          }}
        >
          {comparison.currentBranch}
        </Typography>
        <Box sx={{ flexShrink: 0, display: "inline-flex", alignItems: "center" }}>
          <LuArrowRight size={13} color="currentColor" />
        </Box>
        <Typography
          variant="caption"
          data-testid="commit-comparison-target-branch"
          title={normalizedTargetBranch}
          sx={{
            flex: "1 1 0",
            minWidth: 0,
            display: "block",
            color: "text.secondary",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            px: 0.625,
            py: 0.375,
            border: 1,
            borderColor: "divider",
            borderRadius: 0.75,
            boxSizing: "border-box",
          }}
        >
          {normalizedTargetBranch}
        </Typography>
      </Box>

      <Autocomplete
        size="small"
        options={comparisonScopeOptions}
        value={selectedScopeOption}
        disableClearable
        data-testid="commit-comparison-scope-select"
        getOptionLabel={(option) => option.label}
        isOptionEqualToValue={(option, value) => option.value === value.value}
        onChange={handleSelectComparisonScope}
        ListboxProps={{
          sx: {
            "& .MuiAutocomplete-option": {
              minHeight: 28,
              fontSize: 12,
            },
          },
        }}
        sx={{
          minWidth: 0,
          mt: 1,
          "& .MuiOutlinedInput-root": {
            minHeight: 28,
            py: 0,
          },
          "& .MuiInputBase-input": {
            fontSize: 12,
          },
        }}
        renderInput={(params) => (
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
        )}
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
}

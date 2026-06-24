package workspace

import "time"

const fetchTimeout = 30 * time.Second
const branchCacheTTL = 30 * time.Second
const branchPullRequestCacheTTL = 30 * time.Second

type GitStatusResponse struct {
	Branch string   `json:"branch"`
	Files  []string `json:"files"`
	Raw    string   `json:"raw"`
}

type GitChange struct {
	Path      string `json:"path"`
	Kind      string `json:"kind"`
	Additions int    `json:"additions"`
	Deletions int    `json:"deletions"`
}

type GitChangesBySection struct {
	Unstaged  []GitChange `json:"unstaged"`
	Staged    []GitChange `json:"staged"`
	Untracked []GitChange `json:"untracked"`
}

type GitBranchStatus struct {
	HasUpstream bool `json:"hasUpstream"`
	AheadCount  int  `json:"aheadCount"`
}

type GitBranchPullRequestStatus struct {
	Found          bool                       `json:"found"`
	Branch         string                     `json:"branch"`
	Number         int                        `json:"number,omitempty"`
	Title          string                     `json:"title,omitempty"`
	URL            string                     `json:"url,omitempty"`
	State          string                     `json:"state,omitempty"`
	ReviewDecision string                     `json:"reviewDecision,omitempty"`
	IsDraft        bool                       `json:"isDraft,omitempty"`
	MergedAt       string                     `json:"mergedAt,omitempty"`
	HeadRefName    string                     `json:"headRefName,omitempty"`
	BaseRefName    string                     `json:"baseRefName,omitempty"`
	Checks         []GitPullRequestCheck      `json:"checks,omitempty"`
	Deployments    []GitPullRequestDeployment `json:"deployments,omitempty"`
}

type GitPullRequestCheck struct {
	Name        string `json:"name"`
	Workflow    string `json:"workflow,omitempty"`
	State       string `json:"state"`
	Description string `json:"description,omitempty"`
	URL         string `json:"url,omitempty"`
}

type GitPullRequestDeployment struct {
	ID              int64  `json:"id"`
	Environment     string `json:"environment,omitempty"`
	State           string `json:"state,omitempty"`
	Description     string `json:"description,omitempty"`
	EnvironmentURL  string `json:"environmentUrl,omitempty"`
	CreatedAt       string `json:"createdAt,omitempty"`
	UpdatedAt       string `json:"updatedAt,omitempty"`
	OriginalPayload string `json:"originalPayload,omitempty"`
}

type GitCommitFile struct {
	Path    string `json:"path"`
	OldPath string `json:"oldPath,omitempty"` // populated for renames/copies
	Status  string `json:"status"`             // A, M, D, R, C, T, U, X
}

type GitCommit struct {
	Hash         string          `json:"hash"`
	ShortHash    string          `json:"shortHash"`
	AuthorName   string          `json:"authorName"`
	CommittedAt  string          `json:"committedAt"`
	Subject      string          `json:"subject"`
	ChangedFiles []GitCommitFile `json:"changedFiles"`
}

type GitCommitComparison struct {
	CurrentBranch   string          `json:"currentBranch"`
	TargetBranch    string          `json:"targetBranch"`
	AllChangedFiles []GitCommitFile `json:"allChangedFiles"`
	Commits         []GitCommit     `json:"commits"`
}

type GitBranchDiffSummary struct {
	FileCount int      `json:"fileCount"`
	Additions int      `json:"additions"`
	Deletions int      `json:"deletions"`
	Files     []string `json:"files"`
}

type GitDiffContent struct {
	OldContent            string `json:"oldContent"`
	NewContent            string `json:"newContent"`
	ShouldSkipDecorations bool   `json:"shouldSkipDecorations,omitempty"`
}

type GitBranchList struct {
	CurrentBranch    string   `json:"currentBranch"`
	Branches         []string `json:"branches"`
	LocalBranches    []string `json:"localBranches,omitempty"`
	RemoteBranches   []string `json:"remoteBranches,omitempty"`
	WorktreeBranches []string `json:"worktreeBranches,omitempty"`
}

type GitInspectResult struct {
	IsGitRepository bool   `json:"isGitRepository"`
	RemoteURL       string `json:"remoteUrl,omitempty"`
	CurrentBranch   string `json:"currentBranch,omitempty"`
}

type branchCacheEntry struct {
	data GitBranchList
	at   time.Time
}

type branchPullRequestCacheEntry struct {
	data GitBranchPullRequestStatus
	at   time.Time
}

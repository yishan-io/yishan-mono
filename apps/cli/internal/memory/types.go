package memory

import (
	"context"
	"time"
)

const (
	MaxProjectMemoryChars = 5000
	MaxGlobalMemoryChars  = 1000
)

type FileType string

const (
	FileTypeMemory       FileType = "memory"
	FileTypeArchitecture FileType = "architecture"
	FileTypeArchive     FileType = "archive"
	FileTypeTask        FileType = "task"
	FileTypeFuture      FileType = "future"
	FileTypeGlobal      FileType = "global"
)

type MemoryFile struct {
	ID          int64
	Path        string
	// ProjectPath is the canonical context directory (~/.yishan/contexts/<repoKey>/).
	// Derived by resolving the .my-context symlink in the worktree.
	ProjectPath string
	ProjectID   string
	Type        FileType
	Body        string
	Fingerprint string
	IndexedAt   int64
}

// WorkspaceRef carries the workspace metadata needed for memory indexing.
// WorktreePath is the git worktree directory that contains the .my-context symlink.
// ProjectID is the project ID from the Workspace struct (may be empty for unregistered workspaces).
type WorkspaceRef struct {
	WorktreePath string
	ProjectID    string
}

type MemorySearchResult struct {
	Path    string  `json:"path"`
	Snippet string  `json:"snippet"`
	Score   float64 `json:"score"`
}

type ExtractedKnowledge struct {
	Rules     []string
	Decisions []string
	Learned   []string
	Errors    []string
	LeaveOff  string
}

type MemorySection string

const (
	SectionRules     MemorySection = "## Rules"
	SectionDecisions MemorySection = "## My Decisions"
	SectionLearned   MemorySection = "## What I Learned"
	SectionErrors    MemorySection = "## Errors"
)

// SummarizerConfig controls the automatic post-session summarizer.
// AgentKind selects the agent CLI used for summarization (e.g. "claude",
// "opencode"). When empty the session's own agent is used as the default.
// Model is optional; when empty the agent's default model is used.
type SummarizerConfig struct {
	Enabled   bool
	AgentKind string
	Model     string
}

// RunAgentFunc runs a non-interactive agent prompt and returns its text output.
// The memory package accepts this as a dependency so it doesn't need to know
// about agentcmd directly (avoids import cycle).
type RunAgentFunc func(ctx context.Context, agentKind, model, prompt string) (string, error)

type sessionMessages struct {
	SessionID string
	Messages  []sessionMessage
}

type sessionReader interface {
	ReadRecentSession(agent string, workspacePath string) (*sessionMessages, error)
}

type sessionMessage struct {
	Role      string
	Content   string
	Timestamp time.Time
}

type SummarizeResult struct {
	WrittenPaths []string
	Skipped      bool
}

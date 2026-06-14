package memory

import "time"

const (
	MaxProjectMemoryChars = 5000
	MaxGlobalMemoryChars  = 1000
)

type FileType string

const (
	FileTypeMemory       FileType = "memory"
	FileTypeArchitecture FileType = "architecture"
	FileTypeTask         FileType = "task"
	FileTypeFuture       FileType = "future"
	FileTypeGlobal       FileType = "global"
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

type SummarizerConfig struct {
	Enabled bool
}

type sessionMessages struct {
	SessionID string
	Messages  []sessionMessage
}

type sessionMessage struct {
	Role      string
	Content   string
	Timestamp time.Time
}

package memory

import (
	"context"
	"errors"
	"strings"
	"time"
)

// ErrAgentNotFound is returned by RunAgentFunc when the agent binary cannot be
// located on the system. Callers should treat this as a configuration issue
// (agent not installed) and skip gracefully rather than reporting an error.
var ErrAgentNotFound = errors.New("agent binary not found")

const (
	MaxProjectMemoryChars = 5000
	MaxGlobalMemoryChars  = 1000
	MaxPersonaChars       = 2000
)

type fileType string

const (
	FileTypeMemory       fileType = "memory"
	FileTypeArchitecture fileType = "architecture"
	FileTypeArchive      fileType = "archive"
	FileTypeTask         fileType = "task"
	FileTypeFuture       fileType = "future"
	FileTypeGlobal       fileType = "global"
)

type memoryFile struct {
	ID   int64
	Path string
	// ProjectPath is the canonical context directory (~/.yishan/contexts/<repoKey>/).
	// Derived by resolving the .my-context symlink in the worktree.
	ProjectPath string
	ProjectID   string
	Type        fileType
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

type extractedKnowledge struct {
	LockedDecisions    []string
	DurableDiscoveries []string
}

type memorySection string

const (
	SectionLockedDecisions    memorySection = "## Decisions"
	SectionDurableDiscoveries memorySection = "## Durable Discoveries"
)

// builtInSummarizerAgentKind is the fixed agent used for post-session memory summarization.
const builtInSummarizerAgentKind = "pi"

// SummarizerConfig controls the automatic post-session summarizer.
// AgentKind is retained for backwards-compatible settings wiring, but the
// runtime always normalizes post-session summarization to the built-in Pi
// agent. Model is optional; when empty Pi's default model is used.
type SummarizerConfig struct {
	Enabled              bool
	DisableProjectMemory bool
	DisablePersona       bool
	AgentKind            string
	Model                string
}

// normalizeSummarizerConfig forces summarizer execution onto the built-in Pi agent.
func normalizeSummarizerConfig(cfg SummarizerConfig) SummarizerConfig {
	trimmedAgentKind := strings.TrimSpace(cfg.AgentKind)
	if trimmedAgentKind != "" && trimmedAgentKind != builtInSummarizerAgentKind {
		cfg.Model = ""
	}
	cfg.AgentKind = builtInSummarizerAgentKind
	return cfg
}

// RunAgentFunc runs a non-interactive agent prompt and returns its text output.
// workDir is the working directory for the agent process; pass the workspace
// path so the agent uses the correct project context for config discovery.
// The memory package accepts this as a dependency so it doesn't need to know
// about agentcmd directly (avoids import cycle).
type RunAgentFunc func(ctx context.Context, agentKind, model, prompt, workDir string) (string, error)

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

type summarizeResult struct {
	WrittenPaths    []string
	Skipped         bool
	SourceAgent     string
	SummarizerAgent string
}

type summarizeSessionError struct {
	SourceAgent     string
	SummarizerAgent string
	Err             error
}

func (e *summarizeSessionError) Error() string {
	if e == nil || e.Err == nil {
		return ""
	}
	return e.Err.Error()
}

func (e *summarizeSessionError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

// personaSection identifies a section heading in PERSONA.md.
type personaSection string

const (
	PersonaSectionCodeStyle       personaSection = "## Code Style"
	PersonaSectionWorkflowHabits  personaSection = "## Workflow Habits"
	PersonaSectionDomainExpertise personaSection = "## Domain Expertise"
	PersonaSectionToolPreferences personaSection = "## Tool Preferences"
	PersonaSectionCommunication   personaSection = "## Communication Style"
)

// extractedPersona holds persona signals extracted from session transcripts by the LLM.
type extractedPersona struct {
	CodeStyle          []string
	WorkflowHabits     []string
	DomainExpertise    []string
	ToolPreferences    []string
	CommunicationStyle []string
}

// personaSummarizeResult is returned by personaSummarizer.SummarizeForPersona.
type personaSummarizeResult struct {
	WrittenPath string
	Skipped     bool
}

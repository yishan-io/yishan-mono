package memory

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/rs/zerolog/log"
)

// Service is the application facade for the memory workflows: index storage
// (DB), session summarization (summarizer + per-root queue), daily persona
// batches (persona), and reconciliation/search entry points. It owns the
// per-root queue map; each queue's lifecycle lives in queue.go, the persona
// batch orchestration in persona.go, and the session summarization pipeline
// in summarizer.go.
type Service struct {
	db         *DB
	summarizer *summarizer
	config     SummarizerConfig

	// summarizeQ serializes summarization per context root.
	// key: canonical context root path  value: *summarizeQueue
	summarizeQ sync.Map

	// persona holds the daily persona batch extraction state.
	persona *personaService
}

func NewService(dbPath string, summarizerConfig SummarizerConfig, runAgent RunAgentFunc) (*Service, error) {
	db, err := OpenDB(dbPath)
	if err != nil {
		return nil, fmt.Errorf("open memory db: %w", err)
	}

	normalizedConfig := normalizeSummarizerConfig(summarizerConfig)
	svc := &Service{
		db:     db,
		config: normalizedConfig,
	}
	svc.summarizer = newSummarizer(normalizedConfig, runAgent)
	svc.persona = newPersonaService(normalizedConfig, runAgent)
	return svc, nil
}

func (s *Service) Close() error {
	return s.db.Close()
}

func (s *Service) SummarizerEnabled() bool {
	return s.ProjectMemoryEnabled()
}

func (s *Service) ProjectMemoryEnabled() bool {
	return s.summarizer != nil && s.summarizer.Enabled() && !s.config.DisableProjectMemory
}

func (s *Service) PersonaEnabled() bool {
	return s.persona != nil && s.persona.summarizer.Enabled() && !s.config.DisablePersona
}

func (s *Service) GetConfig() SummarizerConfig {
	return s.config
}

func (s *Service) UpdateSummarizerConfig(cfg SummarizerConfig) {
	normalizedConfig := normalizeSummarizerConfig(cfg)
	s.config = normalizedConfig
	if s.summarizer != nil {
		s.summarizer.UpdateConfig(normalizedConfig)
	}
	if s.persona != nil {
		s.persona.summarizer.UpdateConfig(normalizedConfig)
	}
}

func (s *Service) ReconcileNow(refs []WorkspaceRef) (reconcileResult, error) {
	globalDir, err := globalMemoryDir()
	if err != nil {
		globalDir = ""
	}
	result, err := s.db.Reconcile(refs, globalDir)
	if err != nil {
		return reconcileResult{}, err
	}
	log.Debug().
		Int("inserted", result.Inserted).
		Int("updated", result.Updated).
		Int("deleted", result.Deleted).
		Msg("memory index reconciled")
	return result, nil
}

func (s *Service) Search(ctx context.Context, query string, projectID string, scope string, limit int) ([]MemorySearchResult, error) {
	_ = ctx
	return s.db.SearchMemory(SearchInput{
		Query:     query,
		ProjectID: projectID,
		Scope:     scope,
		Limit:     limit,
	})
}

// OnFileChanged re-indexes a single file. worktreePath is the git worktree
// directory; the canonical context root is resolved internally.
func (s *Service) OnFileChanged(filePath string, worktreePath string, projectID string) error {
	if !shouldIndexPath(filePath) {
		return nil
	}
	contextRoot := resolveContextRoot(worktreePath)
	return s.db.IndexFileOnDisk(filePath, contextRoot, projectID)
}

func (s *Service) OnFileDeleted(filePath string) error {
	return s.db.DeleteByPath(filePath)
}

// SummarizeSession triggers summarization for the workspace, serialized per
// context root so concurrent workspace-close events don't clobber MEMORY.md.
func (s *Service) SummarizeSession(agent string, worktreePath string, projectID string) {
	if !s.ProjectMemoryEnabled() {
		return
	}

	contextRoot := resolveContextRoot(worktreePath)
	if contextRoot == "" {
		return
	}

	q := s.getOrCreateQueue(contextRoot)
	q.submit(summarizeRequest{
		agent:        agent,
		worktreePath: worktreePath,
		projectID:    projectID,
	}, s.runSummarize)
}

// runSummarize executes one summarization request and handles the result.
// It is extracted from the SummarizeSession closure so it can be tested directly.
func (s *Service) runSummarize(req summarizeRequest) {
	result, err := s.summarizer.SummarizeSession(req.agent, req.worktreePath)
	if err != nil {
		var summarizeErr *summarizeSessionError
		sourceAgent := ""
		summarizerAgent := ""
		if errors.As(err, &summarizeErr) {
			sourceAgent = summarizeErr.SourceAgent
			summarizerAgent = summarizeErr.SummarizerAgent
		}
		sourceAgent, summarizerAgent = normalizeSummarizeAgents(req.agent, sourceAgent, summarizerAgent)
		if errors.Is(err, ErrAgentNotFound) {
			log.Debug().Err(err).
				Str("sourceAgent", sourceAgent).
				Str("summarizerAgent", summarizerAgent).
				Msg("skip session summarization: agent binary not installed")
		} else {
			log.Warn().Err(err).
				Str("sourceAgent", sourceAgent).
				Str("summarizerAgent", summarizerAgent).
				Str("workspace", req.worktreePath).
				Msg("session summarization failed")
		}
		return
	}
	s.handleSummarizeResult(req, result)
}

func (s *Service) handleSummarizeResult(req summarizeRequest, result summarizeResult) {
	sourceAgent, summarizerAgent := normalizeSummarizeAgents(req.agent, result.SourceAgent, result.SummarizerAgent)
	if result.Skipped {
		log.Debug().
			Str("sourceAgent", sourceAgent).
			Str("summarizerAgent", summarizerAgent).
			Str("workspace", req.worktreePath).
			Msg("session summarization skipped")
		return
	}
	if len(result.WrittenPaths) == 0 {
		log.Info().
			Str("sourceAgent", sourceAgent).
			Str("summarizerAgent", summarizerAgent).
			Str("workspace", req.worktreePath).
			Msg("session summarization produced no output")
		return
	}
	log.Info().
		Str("sourceAgent", sourceAgent).
		Str("summarizerAgent", summarizerAgent).
		Str("workspace", req.worktreePath).
		Int("files", len(result.WrittenPaths)).
		Msg("session summarized")

	// Index only the files that were actually written — MEMORY.md and
	// any archive/ overflow files. Avoids a full context dir scan.
	ctxRoot := resolveContextRoot(req.worktreePath)
	for _, p := range result.WrittenPaths {
		if idxErr := s.db.IndexFileOnDisk(p, ctxRoot, req.projectID); idxErr != nil {
			log.Warn().Err(idxErr).Str("path", p).Msg("index written file after summarization failed")
		}
	}
}

func normalizeSummarizeAgents(defaultSourceAgent string, sourceAgent string, summarizerAgent string) (string, string) {
	if sourceAgent == "" {
		sourceAgent = defaultSourceAgent
	}
	if summarizerAgent == "" {
		summarizerAgent = sourceAgent
	}
	return sourceAgent, summarizerAgent
}

func (s *Service) getOrCreateQueue(contextRoot string) *summarizeQueue {
	v, _ := s.summarizeQ.LoadOrStore(contextRoot, &summarizeQueue{})
	return v.(*summarizeQueue)
}

// MaybeRunDailyPersonaBatch fires a daily persona extraction batch if the calendar
// day has changed since the last run. It is called from hook_ingress on every
// session stop event. The batch runs asynchronously so it never blocks the hook.
func (s *Service) MaybeRunDailyPersonaBatch(agent string) {
	if !s.PersonaEnabled() {
		return
	}
	s.persona.maybeRunBatch(agent)
}

func GlobalMemoryDir() (string, error) {
	return globalMemoryDir()
}

func globalMemoryDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home dir: %w", err)
	}
	return filepath.Join(home, ".yishan", "memory", "global"), nil
}

func (s *Service) ShouldIndex(filePath string) bool {
	return shouldIndexPath(filePath)
}

func shouldIndexPath(filePath string) bool {
	if !strings.HasSuffix(filepath.Base(filePath), ".md") {
		return false
	}
	// Match canonical context dirs and global memory dir.
	slashed := filepath.ToSlash(filePath)
	if strings.Contains(slashed, "/.yishan/contexts/") {
		// Canonical context files live directly under the context root (or its
		// subdirs). A ".my-context" component under a context root is the
		// nested duplicate created by a memory_store call whose projectRoot
		// pointed at the context root itself — never index it, so the
		// misplacement surfaces instead of being silently absorbed into search.
		return !strings.Contains(slashed, "/.my-context/")
	}
	if strings.Contains(slashed, "/.yishan/memory/") {
		return !strings.Contains(slashed, "/.my-context/")
	}
	// Other paths under the managed ~/.yishan root (e.g. worktree symlink paths)
	// are never indexed directly — the caller resolves .my-context symlinks to
	// their canonical target first.
	if strings.Contains(slashed, "/.yishan/") {
		return false
	}
	// Project-root real `.my-context` directories (non-git projects): index
	// .md files under `/.my-context/`, except a nested `.my-context` inside
	// one (the same misplacement pattern, now inside the project dir itself).
	return strings.Contains(slashed, "/.my-context/") && !strings.Contains(slashed, "/.my-context/.my-context/")
}

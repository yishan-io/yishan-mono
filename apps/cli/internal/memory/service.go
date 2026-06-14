package memory

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/rs/zerolog/log"
)

type Service struct {
	db         *DB
	summarizer *Summarizer
	config     SummarizerConfig

	// summarizeQ serializes summarization per context root.
	// key: canonical context root path  value: *summarizeQueue
	summarizeQ sync.Map
}

// summarizeQueue ensures at most one summarization is in flight per context
// root while coalescing additional requests into a single pending retry.
type summarizeQueue struct {
	mu        sync.Mutex
	inFlight  bool
	pending   *summarizeRequest // at most one pending; newer replaces older
}

type summarizeRequest struct {
	agent         string
	worktreePath  string
	projectID     string
}

func (q *summarizeQueue) submit(req summarizeRequest, run func(summarizeRequest)) {
	q.mu.Lock()
	if q.inFlight {
		// A summarization is already running for this root.
		// Overwrite any pending request with the newer one — the in-flight
		// summarization will re-read MEMORY.md when it finishes, so the
		// latest session data is what matters.
		q.pending = &req
		q.mu.Unlock()
		return
	}
	q.inFlight = true
	q.mu.Unlock()

	go func() {
		for {
			run(req)

			q.mu.Lock()
			next := q.pending
			q.pending = nil
			if next == nil {
				q.inFlight = false
				q.mu.Unlock()
				return
			}
			req = *next
			q.mu.Unlock()
		}
	}()
}

func NewService(dbPath string, summarizerConfig SummarizerConfig, runAgent RunAgentFunc) (*Service, error) {
	db, err := OpenDB(dbPath)
	if err != nil {
		return nil, fmt.Errorf("open memory db: %w", err)
	}

	svc := &Service{
		db:     db,
		config: summarizerConfig,
	}
	svc.summarizer = NewSummarizer(summarizerConfig, runAgent)
	return svc, nil
}

func (s *Service) Close() error {
	return s.db.Close()
}

func (s *Service) SummarizerEnabled() bool {
	return s.summarizer != nil && s.summarizer.Enabled()
}

func (s *Service) GetConfig() SummarizerConfig {
	return s.config
}

func (s *Service) UpdateSummarizerConfig(cfg SummarizerConfig) {
	s.config = cfg
	if s.summarizer != nil {
		s.summarizer.UpdateConfig(cfg)
	}
}

func (s *Service) ReconcileNow(refs []WorkspaceRef) (ReconcileResult, error) {
	globalDir, err := globalMemoryDir()
	if err != nil {
		globalDir = ""
	}
	result, err := s.db.Reconcile(refs, globalDir)
	if err != nil {
		return ReconcileResult{}, err
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
	if !s.summarizer.Enabled() {
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
	}, func(req summarizeRequest) {
		writtenPaths, err := s.summarizer.SummarizeSession(req.agent, req.worktreePath)
		if err != nil {
			log.Warn().Err(err).
				Str("agent", req.agent).
				Str("workspace", req.worktreePath).
				Msg("session summarization failed")
			return
		}
		if len(writtenPaths) == 0 {
			return
		}
		log.Debug().Str("agent", req.agent).Str("workspace", req.worktreePath).
			Int("files", len(writtenPaths)).Msg("session summarized")

		// Index only the files that were actually written — MEMORY.md and
		// any archive/ overflow files. Avoids a full context dir scan.
		ctxRoot := resolveContextRoot(req.worktreePath)
		for _, p := range writtenPaths {
			if idxErr := s.db.IndexFileOnDisk(p, ctxRoot, req.projectID); idxErr != nil {
				log.Warn().Err(idxErr).Str("path", p).Msg("index written file after summarization failed")
			}
		}
	})
}

func (s *Service) getOrCreateQueue(contextRoot string) *summarizeQueue {
	v, _ := s.summarizeQ.LoadOrStore(contextRoot, &summarizeQueue{})
	return v.(*summarizeQueue)
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
	return strings.Contains(slashed, "/.yishan/contexts/") ||
		strings.Contains(slashed, "/.yishan/memory/")
}

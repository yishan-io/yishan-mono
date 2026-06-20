package memory

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

type Service struct {
	db         *DB
	summarizer *Summarizer
	config     SummarizerConfig

	// summarizeQ serializes summarization per context root.
	// key: canonical context root path  value: *summarizeQueue
	summarizeQ sync.Map

	// persona holds the daily persona batch extraction state.
	persona *personaService
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
	svc.persona = newPersonaService(summarizerConfig, runAgent)
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
	s.config = cfg
	if s.summarizer != nil {
		s.summarizer.UpdateConfig(cfg)
	}
	if s.persona != nil {
		s.persona.summarizer.UpdateConfig(cfg)
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
		if errors.Is(err, ErrAgentNotFound) {
			log.Debug().Err(err).
				Str("agent", req.agent).
				Msg("skip session summarization: agent binary not installed")
		} else {
			log.Warn().Err(err).
				Str("agent", req.agent).
				Str("workspace", req.worktreePath).
				Msg("session summarization failed")
		}
		return
	}
	s.handleSummarizeResult(req, result)
}

func (s *Service) handleSummarizeResult(req summarizeRequest, result SummarizeResult) {
	if result.Skipped {
		log.Debug().
			Str("agent", req.agent).
			Str("workspace", req.worktreePath).
			Msg("session summarization skipped")
		return
	}
	if len(result.WrittenPaths) == 0 {
			log.Info().
				Str("agent", req.agent).
				Str("workspace", req.worktreePath).
				Msg("session summarization produced no output")
			return
		}
		log.Info().Str("agent", req.agent).Str("workspace", req.worktreePath).
			Int("files", len(result.WrittenPaths)).Msg("session summarized")

		// Index only the files that were actually written — MEMORY.md and
		// any archive/ overflow files. Avoids a full context dir scan.
		ctxRoot := resolveContextRoot(req.worktreePath)
		for _, p := range result.WrittenPaths {
			if idxErr := s.db.IndexFileOnDisk(p, ctxRoot, req.projectID); idxErr != nil {
				log.Warn().Err(idxErr).Str("path", p).Msg("index written file after summarization failed")
			}
		}
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

// personaService manages the daily persona batch extraction state.
type personaService struct {
	summarizer         *PersonaSummarizer
	dbReader           *agentDBReader
	mu                 sync.Mutex
	lastExtractionDate string // "YYYY-MM-DD" UTC, empty = never run
}

func newPersonaService(cfg SummarizerConfig, runAgent RunAgentFunc) *personaService {
	return &personaService{
		summarizer: NewPersonaSummarizer(cfg, runAgent),
		dbReader:   newAgentDBReader(),
	}
}

// maybeRunBatch starts the daily batch goroutine when the calendar day has
// advanced past lastExtractionDate. Guards against concurrent runs with a mutex.
func (p *personaService) maybeRunBatch(agent string) {
	today := time.Now().UTC().Format("2006-01-02")

	p.mu.Lock()
	if today == p.lastExtractionDate {
		p.mu.Unlock()
		return
	}
	p.lastExtractionDate = today
	p.mu.Unlock()

	// Skip the goroutine entirely if the summarizer isn't configured, but still
	// advance the date so we don't re-trigger on every subsequent session stop.
	if !p.summarizer.Enabled() {
		return
	}

	// Extract for yesterday's sessions.
	yesterday := time.Now().UTC().AddDate(0, 0, -1)
	go p.runBatch(agent, yesterday)
}

// runBatch performs the actual extraction for the given date. Runs in a goroutine.
func (p *personaService) runBatch(agent string, date time.Time) {
	sessions, err := p.dbReader.ReadSessionsForDate(agent, date)
	if err != nil {
		log.Debug().Err(err).Str("agent", agent).Msg("persona batch: read sessions failed")
		return
	}
	if len(sessions) == 0 {
		log.Debug().Str("agent", agent).Str("date", date.Format("2006-01-02")).Msg("persona batch: no sessions found")
		return
	}

	result, err := p.summarizer.SummarizeForPersona(agent, sessions)
	if err != nil {
		if errors.Is(err, ErrAgentNotFound) {
			log.Debug().Err(err).Str("agent", agent).Msg("persona batch: agent binary not found, skipping")
		} else {
			log.Warn().Err(err).Str("agent", agent).Msg("persona batch: extraction failed")
		}
		return
	}
	if result.Skipped {
		log.Debug().Str("agent", agent).Msg("persona batch: skipped")
		return
	}
	log.Info().Str("agent", agent).Str("path", result.WrittenPath).Msg("persona batch: written")
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

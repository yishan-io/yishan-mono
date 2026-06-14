package memory

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/rs/zerolog/log"
)

type Service struct {
	db         *DB
	summarizer *Summarizer
	config     SummarizerConfig
}

func NewService(dbPath string, summarizerConfig SummarizerConfig) (*Service, error) {
	db, err := OpenDB(dbPath)
	if err != nil {
		return nil, fmt.Errorf("open memory db: %w", err)
	}

	svc := &Service{
		db:     db,
		config: summarizerConfig,
	}
	svc.summarizer = NewSummarizer(summarizerConfig.Enabled)
	return svc, nil
}

func (s *Service) Close() error {
	return s.db.Close()
}

func (s *Service) SummarizerEnabled() bool {
	return s.summarizer != nil && s.summarizer.Enabled()
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

// SummarizeSession triggers async summarization for the workspace.
// worktreePath is the git worktree directory.
func (s *Service) SummarizeSession(agent string, worktreePath string, projectID string) {
	if !s.summarizer.Enabled() {
		return
	}

	go func() {
		if err := s.summarizer.SummarizeSession(agent, worktreePath); err != nil {
			log.Warn().Err(err).Str("agent", agent).Str("workspace", worktreePath).Msg("session summarization failed")
			return
		}
		log.Debug().Str("agent", agent).Str("workspace", worktreePath).Msg("session summarized")

		// Re-index MEMORY.md in the canonical context dir after writing.
		contextRoot := resolveContextRoot(worktreePath)
		if contextRoot == "" {
			return
		}
		memoryPath := filepath.Join(contextRoot, "MEMORY.md")
		if idxErr := s.db.IndexFileOnDisk(memoryPath, contextRoot, projectID); idxErr != nil {
			log.Warn().Err(idxErr).Msg("reindex MEMORY.md after summarization")
		}
	}()
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

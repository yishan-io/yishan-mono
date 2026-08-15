package node

import (
	"os"
	"path/filepath"

	"yishan/apps/cli/internal/memory"

	"github.com/rs/zerolog/log"
)

// initMemory migrates a legacy memory.db into memory/memory.db and opens the
// memory service. A failed init is non-fatal: memory features are disabled but
// the daemon keeps running.
func (a *App) initMemory(dataDir string, summarizer memory.SummarizerConfig) {
	oldPath := filepath.Join(dataDir, "memory.db")
	newPath := filepath.Join(dataDir, "memory", "memory.db")

	if _, err := os.Stat(oldPath); err == nil {
		if _, err := os.Stat(newPath); os.IsNotExist(err) {
			if err := os.MkdirAll(filepath.Dir(newPath), 0o755); err != nil {
				log.Warn().Err(err).Msg("failed to create memory directory for migration")
			} else if err := os.Rename(oldPath, newPath); err != nil {
				log.Warn().Err(err).Str("from", oldPath).Str("to", newPath).Msg("failed to migrate memory.db")
			} else {
				log.Info().Str("from", oldPath).Str("to", newPath).Msg("migrated memory.db to memory/ directory")
			}
		}
	}

	memSvc, memErr := memory.NewService(newPath, summarizer, BuildRunAgentFunc())
	if memErr != nil {
		log.Warn().Err(memErr).Msg("memory service initialization failed, memory features disabled")
		return
	}
	a.memory = memSvc
}

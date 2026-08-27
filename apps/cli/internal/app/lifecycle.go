package app

import (
	"database/sql"
	"errors"
	"fmt"

	modellist "yishan/apps/cli/internal/agent/catalog"
	"yishan/apps/cli/internal/agent/dsh"
	"yishan/apps/cli/internal/memory"

	"github.com/rs/zerolog/log"
)

func (a *App) closeDependencies() error {
	var closeErr error
	if a.dsh != nil {
		closeErr = errors.Join(closeErr, closeDSH(a.dsh))
	}
	if a.tokenUsage != nil {
		a.tokenUsage.Close()
	}
	if a.memory != nil {
		closeErr = errors.Join(closeErr, closeMemory(a.memory))
	}
	if a.agentSvc != nil {
		a.agentSvc.Shutdown()
	}
	modellist.ShutdownShell()
	if a.cancelCleanup != nil {
		a.cancelCleanup()
	}
	return errors.Join(closeErr, closeDatabase(a.database))
}

func closeDSH(supervisor *dsh.Supervisor) error {
	if err := supervisor.Close(); err != nil {
		log.Warn().Err(err).Msg("failed to close DSH supervisor")
		return fmt.Errorf("close DSH supervisor: %w", err)
	}
	return nil
}

func closeMemory(service *memory.Service) error {
	if err := service.Close(); err != nil {
		log.Warn().Err(err).Msg("failed to close memory service")
		return fmt.Errorf("close memory service: %w", err)
	}
	return nil
}

func closeDatabase(database *sql.DB) error {
	if database == nil {
		return nil
	}
	if err := database.Close(); err != nil {
		log.Warn().Err(err).Msg("failed to close local database")
		return fmt.Errorf("close local database: %w", err)
	}
	return nil
}

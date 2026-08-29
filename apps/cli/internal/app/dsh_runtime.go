package app

import (
	"context"
	"fmt"
	"time"

	"yishan/apps/cli/internal/agent/dsh"
	nodeagent "yishan/apps/cli/internal/node/agent"

	"github.com/rs/zerolog/log"
)

func dshSessionsFor(supervisor *dsh.Supervisor) nodeagent.DSHSessions {
	if supervisor == nil {
		return nil
	}
	return supervisor
}

func dshPluginRuntimeFor(supervisor *dsh.Supervisor) nodeagent.DSHPluginRuntime {
	if supervisor == nil {
		return nil
	}
	return supervisor
}

func newDSHSupervisor(cfg Config) *dsh.Supervisor {
	if !cfg.DSHEnabled {
		return nil
	}
	return dsh.NewSupervisor(dsh.Config{
		Command:     dsh.NewCommandFactory(cfg.DSHNodePath, cfg.DSHRuntimePath, cfg.DSHDataDir, cfg.DSHDeveloperMode),
		Initialize:  dsh.InitializeConfig{CWD: cfg.DSHDataDir, Provider: cfg.DSHProvider, Model: cfg.DSHModel},
		Diagnostics: logDSHDiagnostic,
	})
}

func (a *App) startDSHSupervisor() error {
	var startErr error
	if a.dsh != nil {
		if err := a.dsh.Start(context.Background()); err != nil {
			startErr = fmt.Errorf("start DSH supervisor: %w", err)
		}
	}
	a.recoverRunningBackgroundJobs()
	return startErr
}

func (a *App) recoverRunningBackgroundJobs() {
	if a.backgroundJobs == nil {
		return
	}
	ctx := a.backgroundJobRecoveryCtx
	if ctx == nil {
		ctx = context.Background()
	}
	go func() {
		for {
			if err := a.backgroundJobs.RecoverRunning(ctx); err == nil {
				return
			} else {
				log.Error().Err(err).Msg("recover running background jobs")
			}
			if !waitForBackgroundJobRecoveryRetry(ctx) {
				return
			}
		}
	}()
}

func waitForBackgroundJobRecoveryRetry(ctx context.Context) bool {
	timer := time.NewTimer(time.Second)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}

// DSHHealth returns the experimental runtime state when it is configured.
func (a *App) DSHHealth() (dsh.Health, bool) {
	if a.dsh == nil {
		return dsh.Health{}, false
	}
	return a.dsh.Health(), true
}

func logDSHDiagnostic(message string) {
	log.Warn().Str("component", "dsh-supervisor").Msg(message)
}

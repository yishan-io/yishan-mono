package daemon

import (
	cliruntime "yishan/apps/cli/internal/runtime"
	"yishan/apps/cli/internal/tokenusage"
	"yishan/apps/cli/internal/workspace"
)

type tokenUsageCollectorDebugState = tokenusage.CollectorDebugState

type tokenUsageService interface {
	StartStartupScan()
	SyncNow(source string)
	Trigger(agentKind string, source string)
	RequestRecentRecoveryScan(source string)
	DebugState() tokenUsageCollectorDebugState
	Close()
}

func newTokenUsageCollector(manager *workspace.Manager, runtime *cliruntime.Runtime, configPath string) (tokenUsageService, error) {
	return tokenusage.NewCollector(manager, runtime, configPath)
}

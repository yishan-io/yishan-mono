package provision

import (
	"path/filepath"

	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/api"
	"yishan/apps/cli/internal/daemon"
	"yishan/apps/cli/internal/workspace"
)

type RuntimeConfig struct {
	ConfigPath string
}

func NewRuntimeProvisioner(apiClient *api.Client, cfg RuntimeConfig) *Provisioner {
	localNodeID := ""

	statePath, err := daemon.ResolveStateFilePath(cfg.ConfigPath)
	if err != nil {
		log.Warn().Err(err).Msg("failed to resolve daemon runtime state path")
	} else {
		daemonIDPath := filepath.Join(filepath.Dir(statePath), daemon.IDFileName)
		if id, err := daemon.EnsureDaemonID(daemonIDPath); err == nil {
			localNodeID = id
		} else {
			log.Warn().Err(err).Msg("failed to resolve local daemon id")
		}
	}

	return NewLocalProvisioner(apiClient, workspace.NewManager(), localNodeID)
}

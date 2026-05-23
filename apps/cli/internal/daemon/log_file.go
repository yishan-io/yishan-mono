package daemon

import (
	"path/filepath"
	"strings"

	"yishan/apps/cli/internal/config"
)

const (
	LogDirName  = "logs"
	LogFileName = "daemon.log"
)

// ResolveLogFilePath returns the default daemon log file path based on the
// config path. The log file is stored in a "logs" subdirectory next to the
// config file (e.g. ~/.yishan/profiles/<profile>/logs/daemon.log).
//
// If configPath is empty, falls back to $HOME/logs/daemon.log.
func ResolveLogFilePath(configPath string) (string, error) {
	if strings.TrimSpace(configPath) != "" {
		return filepath.Join(filepath.Dir(configPath), LogDirName, LogFileName), nil
	}

	yishanHome, err := config.HomeDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(yishanHome, LogDirName, LogFileName), nil
}

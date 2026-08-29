package daemon

import (
	"path/filepath"
	"strings"

	"yishan/apps/cli/internal/platform/config"
)

const (
	LogDirName         = "logs"
	SystemLogFileName  = "system.log"
	RuntimeLogFileName = "runtime.log"
)

// ResolveLogFilePath returns the default daemon log file path based on the
// config path. The log file is stored in a "logs" subdirectory next to the
// config file (e.g. ~/.yishan/profiles/<profile>/logs/system.log).
//
// If configPath is empty, falls back to $HOME/logs/system.log.
func ResolveLogFilePath(configPath string) (string, error) {
	if strings.TrimSpace(configPath) != "" {
		return filepath.Join(filepath.Dir(configPath), LogDirName, SystemLogFileName), nil
	}

	yishanHome, err := config.HomeDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(yishanHome, LogDirName, SystemLogFileName), nil
}

// resolveRuntimeLogFilePath returns the log file used after bootstrap resolves
// the active account. Custom log paths remain unchanged, and unknown accounts
// continue using the profile log path.
func resolveRuntimeLogFilePath(cfg RunConfig, credentialPath string) (string, error) {
	if cfg.HasCustomLogFile || cfg.LogFilePath == "" {
		return cfg.LogFilePath, nil
	}
	accountDir, err := config.ResolveAccountDataDir(credentialPath)
	if err != nil {
		return "", err
	}
	profileDir := filepath.Dir(credentialPath)
	if accountDir == profileDir {
		return cfg.LogFilePath, nil
	}
	accountID, err := filepath.Rel(filepath.Join(profileDir, config.AccountDirName), accountDir)
	if err != nil || !config.IsSafeAccountUserID(accountID) {
		return cfg.LogFilePath, nil
	}
	return filepath.Join(accountDir, LogDirName, RuntimeLogFileName), nil
}

// switchRuntimeLogFile changes structured daemon output to the account log
// after identity resolution. Existing profile logs intentionally stay put.
func switchRuntimeLogFile(cfg *RunConfig, credentialPath string) error {
	runtimePath, err := resolveRuntimeLogFilePath(*cfg, credentialPath)
	if err != nil || runtimePath == cfg.LogFilePath {
		return err
	}
	if cfg.LogFileWriter != nil {
		if err := cfg.LogFileWriter.SwitchPath(runtimePath); err != nil {
			return err
		}
	}
	cfg.LogFilePath = runtimePath
	return nil
}

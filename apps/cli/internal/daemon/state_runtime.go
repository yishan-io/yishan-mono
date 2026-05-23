package daemon

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"yishan/apps/cli/internal/config"
)

const StateFileName = "daemon.state.json"

type RuntimeState struct {
	PID       int       `json:"pid"`
	Host      string    `json:"host"`
	Port      int       `json:"port"`
	StartedAt time.Time `json:"started_at"`
}

func ResolveStateFilePath(configPath string) (string, error) {
	if strings.TrimSpace(configPath) != "" {
		return filepath.Join(filepath.Dir(configPath), StateFileName), nil
	}

	yishanHome, err := config.HomeDir()
	if err != nil {
		return "", err
	}

	return filepath.Join(yishanHome, StateFileName), nil
}

func LoadState(path string) (RuntimeState, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return RuntimeState{}, err
	}

	var state RuntimeState
	if err := json.Unmarshal(raw, &state); err != nil {
		return RuntimeState{}, fmt.Errorf("parse daemon state file %q: %w", path, err)
	}

	if state.PID <= 0 || strings.TrimSpace(state.Host) == "" || state.Port <= 0 {
		return RuntimeState{}, fmt.Errorf("invalid daemon state file %q", path)
	}

	return state, nil
}

func SaveState(path string, state RuntimeState) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create daemon state dir for %q: %w", path, err)
	}

	encoded, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("encode daemon state: %w", err)
	}

	tempPath := path + ".tmp"
	if err := os.WriteFile(tempPath, encoded, 0o600); err != nil {
		return fmt.Errorf("write daemon state file %q: %w", tempPath, err)
	}

	if err := os.Rename(tempPath, path); err != nil {
		_ = os.Remove(tempPath)
		return fmt.Errorf("replace daemon state file %q: %w", path, err)
	}

	return nil
}

func RemoveState(path string) error {
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("remove daemon state file %q: %w", path, err)
	}

	return nil
}

func IsProcessRunning(pid int) bool {
	if pid <= 0 {
		return false
	}

	err := syscall.Kill(pid, 0)
	return err == nil || err == syscall.EPERM
}

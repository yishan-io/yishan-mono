package daemon

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

<<<<<<< Updated upstream
	"yishan/apps/cli/internal/platform/config"
=======
	"github.com/rs/zerolog/log"
	"yishan/apps/cli/internal/config"
>>>>>>> Stashed changes
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
	if !IsProcessRunning(state.PID) {
		if err := RemoveState(path); err != nil {
			return RuntimeState{}, fmt.Errorf("remove stale daemon state file %q: %w", path, err)
		}
		return RuntimeState{}, &os.PathError{Op: "open", Path: path, Err: os.ErrNotExist}
	}

	return state, nil
}

func saveState(path string, state RuntimeState) error {
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

// removeOwnedState removes the daemon state file only when it still records
// pid as the owner. A dying daemon must never delete the state of a
// replacement daemon that started on the same profile before this one fully
// exited: unconditional removal orphans the survivor (state missing while the
// daemon is alive), which makes the next start/restart unable to find it and
// — once the lock file is also gone — spawn a twin that fights it over the
// relay nodeId.
func removeOwnedState(path string, pid int) {
	raw, err := os.ReadFile(path)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Warn().Err(err).Str("state_path", path).Msg("failed to read daemon state file on exit")
		}
		return
	}

	var state RuntimeState
	if err := json.Unmarshal(raw, &state); err != nil {
		return
	}
	if state.PID != pid {
		log.Debug().
			Int("state_pid", state.PID).
			Int("pid", pid).
			Str("state_path", path).
			Msg("daemon state file belongs to another daemon; leaving it in place")
		return
	}

	if err := RemoveState(path); err != nil {
		log.Warn().Err(err).Str("state_path", path).Msg("failed to remove daemon state file")
	}
}

package daemon

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const IDFileName = "daemon.id"

func EnsureDaemonID(path string) (string, error) {
	raw, err := os.ReadFile(path)
	if err == nil {
		existing := strings.TrimSpace(string(raw))
		if existing != "" {
			return existing, nil
		}
	}
	if err != nil && !os.IsNotExist(err) {
		return "", fmt.Errorf("read daemon id file %q: %w", path, err)
	}

	value, err := newDaemonID()
	if err != nil {
		return "", err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", fmt.Errorf("create daemon id dir for %q: %w", path, err)
	}

	tempPath := path + ".tmp"
	if err := os.WriteFile(tempPath, []byte(value), 0o600); err != nil {
		return "", fmt.Errorf("write daemon id file %q: %w", tempPath, err)
	}

	if err := os.Rename(tempPath, path); err != nil {
		_ = os.Remove(tempPath)
		return "", fmt.Errorf("replace daemon id file %q: %w", path, err)
	}

	return value, nil
}

func newDaemonID() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate daemon id: %w", err)
	}

	return hex.EncodeToString(raw), nil
}

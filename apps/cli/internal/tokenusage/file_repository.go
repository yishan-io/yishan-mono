package tokenusage

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"yishan/apps/cli/internal/config"
)

const hourlyUsageFileName = "token-usage-hourly.json"

type fileHourlyUsageRepository struct {
	mu   sync.Mutex
	path string
}

type hourlyUsageFile struct {
	Rows []HourlyUsageRow `json:"rows"`
}

func NewFileHourlyUsageRepository(configPath string) (HourlyUsageRepository, error) {
	filePath, err := resolveHourlyUsagePath(configPath)
	if err != nil {
		return nil, err
	}
	return &fileHourlyUsageRepository{path: filePath}, nil
}

func resolveHourlyUsagePath(configPath string) (string, error) {
	if configPath != "" {
		return filepath.Join(filepath.Dir(configPath), hourlyUsageFileName), nil
	}
	yishanHome, err := config.HomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(yishanHome, hourlyUsageFileName), nil
}

func (r *fileHourlyUsageRepository) ReplaceAgentHourlyRows(
	ctx context.Context,
	agentKind string,
	rows []HourlyUsageRow,
) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	state, err := r.loadLocked()
	if err != nil {
		return err
	}
	state.Rows = filterRowsWithoutAgent(state.Rows, agentKind)
	state.Rows = append(state.Rows, rows...)
	if err := r.saveLocked(state); err != nil {
		return err
	}
	return nil
}

func filterRowsWithoutAgent(rows []HourlyUsageRow, agentKind string) []HourlyUsageRow {
	filtered := make([]HourlyUsageRow, 0, len(rows))
	for _, row := range rows {
		if row.AgentKind == agentKind {
			continue
		}
		filtered = append(filtered, row)
	}
	return filtered
}

func (r *fileHourlyUsageRepository) loadLocked() (hourlyUsageFile, error) {
	raw, err := os.ReadFile(r.path)
	if err != nil {
		if os.IsNotExist(err) {
			return hourlyUsageFile{}, nil
		}
		return hourlyUsageFile{}, fmt.Errorf("read usage file %q: %w", r.path, err)
	}
	if len(raw) == 0 {
		return hourlyUsageFile{}, nil
	}
	var parsed hourlyUsageFile
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return hourlyUsageFile{}, fmt.Errorf("parse usage file %q: %w", r.path, err)
	}
	return parsed, nil
}

func (r *fileHourlyUsageRepository) saveLocked(file hourlyUsageFile) error {
	if err := os.MkdirAll(filepath.Dir(r.path), 0o755); err != nil {
		return fmt.Errorf("create usage dir for %q: %w", r.path, err)
	}
	raw, err := json.MarshalIndent(file, "", "  ")
	if err != nil {
		return fmt.Errorf("encode usage file: %w", err)
	}
	tempPath := r.path + ".tmp"
	if err := os.WriteFile(tempPath, raw, 0o600); err != nil {
		return fmt.Errorf("write usage temp file %q: %w", tempPath, err)
	}
	if err := os.Rename(tempPath, r.path); err != nil {
		_ = os.Remove(tempPath)
		return fmt.Errorf("replace usage file %q: %w", r.path, err)
	}
	return nil
}

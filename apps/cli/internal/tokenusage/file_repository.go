package tokenusage

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	localdb "yishan/apps/cli/internal/db"

	"yishan/apps/cli/internal/config"
)

const hourlyUsageFileName = "token-usage-hourly.json"

type fileHourlyUsageRepository struct {
	mu   sync.Mutex
	path string
}

type hourlyUsageFile struct {
	Rows                 []HourlyUsageRow `json:"rows"`
	LastSuccessfulSyncAt int64            `json:"lastSuccessfulSyncAt,omitempty"`
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
	mergedRows := mergeAgentHourlyRows(state.Rows, agentKind, rows)

	sort.Slice(mergedRows, func(i, j int) bool {
		return localdb.CompareHourlyUsageRows(mergedRows[i], mergedRows[j]) < 0
	})

	state.Rows = filterRowsWithoutAgent(state.Rows, agentKind)
	state.Rows = append(state.Rows, mergedRows...)
	pruneExpiredHourlyUsageRows(&state, time.Now().UTC())
	if err := r.saveLocked(state); err != nil {
		return err
	}
	return nil
}

func mergeAgentHourlyRows(existingRows []HourlyUsageRow, agentKind string, scannedRows []HourlyUsageRow) []HourlyUsageRow {
	existingByKey := make(map[string]HourlyUsageRow)
	for _, row := range existingRows {
		if row.AgentKind != agentKind {
			continue
		}
		existingByKey[localdb.HourlyUsageRowKey(row)] = row
	}

	mergedRows := make([]HourlyUsageRow, 0, maxInt(len(existingByKey), len(scannedRows)))
	seenKeys := make(map[string]struct{}, len(scannedRows))
	for _, row := range scannedRows {
		key := localdb.HourlyUsageRowKey(row)
		seenKeys[key] = struct{}{}
		existing, hasExisting := existingByKey[key]
		mergedRows = append(mergedRows, localdb.MergeHourlyUsageRow(existing, hasExisting, row))
	}

	for key, row := range existingByKey {
		if _, alreadyMerged := seenKeys[key]; alreadyMerged {
			continue
		}
		mergedRows = append(mergedRows, row)
	}

	return mergedRows
}

func (r *fileHourlyUsageRepository) ListDirtyHourlyRows(ctx context.Context) ([]HourlyUsageRow, error) {
	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	default:
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	state, err := r.loadLocked()
	if err != nil {
		return nil, err
	}

	dirtyRows := make([]HourlyUsageRow, 0, len(state.Rows))
	for _, row := range state.Rows {
		if !row.Dirty {
			continue
		}
		dirtyRows = append(dirtyRows, row)
	}

	sort.Slice(dirtyRows, func(i, j int) bool {
		return localdb.CompareHourlyUsageRows(dirtyRows[i], dirtyRows[j]) < 0
	})
	return dirtyRows, nil
}

func (r *fileHourlyUsageRepository) MarkHourlyRowsSynced(ctx context.Context, rows []HourlyUsageRow, syncedAt int64) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}

	if len(rows) == 0 {
		return nil
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	state, err := r.loadLocked()
	if err != nil {
		return err
	}

	syncedByKey := make(map[string]HourlyUsageRow, len(rows))
	for _, row := range rows {
		syncedByKey[localdb.HourlyUsageRowKey(row)] = row
	}

	for i := range state.Rows {
		syncedRow, ok := syncedByKey[localdb.HourlyUsageRowKey(state.Rows[i])]
		if !ok {
			continue
		}
		if state.Rows[i].UpdatedAt != syncedRow.UpdatedAt {
			continue
		}
		if !localdb.HourlyRowsMatchForSync(state.Rows[i], syncedRow) {
			continue
		}
		state.Rows[i].Dirty = false
		state.Rows[i].LastSyncedAt = syncedAt
	}
	state.LastSuccessfulSyncAt = syncedAt
	pruneExpiredHourlyUsageRows(&state, time.UnixMilli(syncedAt).UTC())

	return r.saveLocked(state)
}

func (r *fileHourlyUsageRepository) GetHourlyUsageSyncState(ctx context.Context) (HourlyUsageSyncState, error) {
	select {
	case <-ctx.Done():
		return HourlyUsageSyncState{}, ctx.Err()
	default:
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	state, err := r.loadLocked()
	if err != nil {
		return HourlyUsageSyncState{}, err
	}

	dirtyCount := 0
	for _, row := range state.Rows {
		if row.Dirty {
			dirtyCount++
		}
	}

	return HourlyUsageSyncState{
		TotalRows:            len(state.Rows),
		DirtyRows:            dirtyCount,
		LastSuccessfulSyncAt: state.LastSuccessfulSyncAt,
	}, nil
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

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}

func pruneExpiredHourlyUsageRows(file *hourlyUsageFile, now time.Time) {
	retentionCutoff := now.Add(-localdb.HourlyUsageRetentionWindow).UnixMilli()
	keptRows := file.Rows[:0]
	for _, row := range file.Rows {
		if !row.Dirty && row.BucketStartHourUTC < retentionCutoff {
			continue
		}
		keptRows = append(keptRows, row)
	}
	file.Rows = keptRows
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

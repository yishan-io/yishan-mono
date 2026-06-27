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
		return compareHourlyUsageRows(mergedRows[i], mergedRows[j]) < 0
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
		existingByKey[hourlyUsageRowKey(row)] = row
	}

	mergedRows := make([]HourlyUsageRow, 0, maxInt(len(existingByKey), len(scannedRows)))
	seenKeys := make(map[string]struct{}, len(scannedRows))
	for _, row := range scannedRows {
		key := hourlyUsageRowKey(row)
		seenKeys[key] = struct{}{}
		existing, hasExisting := existingByKey[key]
		mergedRows = append(mergedRows, mergeHourlyUsageRow(existing, hasExisting, row))
	}

	for key, row := range existingByKey {
		if _, alreadyMerged := seenKeys[key]; alreadyMerged {
			continue
		}
		mergedRows = append(mergedRows, row)
	}

	return mergedRows
}

func mergeHourlyUsageRow(existingRow HourlyUsageRow, hasExisting bool, scannedRow HourlyUsageRow) HourlyUsageRow {
	if !hasExisting {
		scannedRow.Dirty = true
		return scannedRow
	}
	if existingRow.TotalTokens > scannedRow.TotalTokens {
		return existingRow
	}
	if hourlyRowsMatchForSync(existingRow, scannedRow) {
		return existingRow
	}

	scannedRow.Dirty = true
	scannedRow.LastSyncedAt = existingRow.LastSyncedAt
	return scannedRow
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
		return compareHourlyUsageRows(dirtyRows[i], dirtyRows[j]) < 0
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
		syncedByKey[hourlyUsageRowKey(row)] = row
	}

	for i := range state.Rows {
		syncedRow, ok := syncedByKey[hourlyUsageRowKey(state.Rows[i])]
		if !ok {
			continue
		}
		if state.Rows[i].UpdatedAt != syncedRow.UpdatedAt {
			continue
		}
		if !hourlyRowsMatchForSync(state.Rows[i], syncedRow) {
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

func hourlyUsageRowKey(row HourlyUsageRow) string {
	return row.ProjectID + "|" + row.WorkspaceID + "|" + row.AgentKind + "|" + row.ModelNormalized + "|" + fmt.Sprintf("%d", row.BucketStartHourUTC)
}

func hourlyRowsMatchForSync(left HourlyUsageRow, right HourlyUsageRow) bool {
	return left.ProjectID == right.ProjectID &&
		left.WorkspaceID == right.WorkspaceID &&
		left.WorkspacePath == right.WorkspacePath &&
		left.AgentKind == right.AgentKind &&
		left.Model == right.Model &&
		left.ModelNormalized == right.ModelNormalized &&
		left.BucketStartHourUTC == right.BucketStartHourUTC &&
		left.InputTokens == right.InputTokens &&
		left.OutputTokens == right.OutputTokens &&
		left.CachedInputTokens == right.CachedInputTokens &&
		left.CachedWriteTokens == right.CachedWriteTokens &&
		left.ReasoningTokens == right.ReasoningTokens &&
		left.TotalTokens == right.TotalTokens &&
		left.EventCount == right.EventCount &&
		left.SessionCount == right.SessionCount &&
		left.TurnCount == right.TurnCount &&
		left.ToolCallCount == right.ToolCallCount &&
		left.AttributionConfidence == right.AttributionConfidence
}

func compareHourlyUsageRows(left HourlyUsageRow, right HourlyUsageRow) int {
	if left.BucketStartHourUTC != right.BucketStartHourUTC {
		if left.BucketStartHourUTC < right.BucketStartHourUTC {
			return -1
		}
		return 1
	}
	leftKey := hourlyUsageRowKey(left)
	rightKey := hourlyUsageRowKey(right)
	if leftKey < rightKey {
		return -1
	}
	if leftKey > rightKey {
		return 1
	}
	return 0
}

func maxInt(left int, right int) int {
	if left > right {
		return left
	}
	return right
}

func pruneExpiredHourlyUsageRows(file *hourlyUsageFile, now time.Time) {
	retentionCutoff := now.Add(-HourlyUsageLocalRetentionWindow).UnixMilli()
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

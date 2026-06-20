package tokenusage

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"yishan/apps/cli/internal/agentkind"
)

const opencodeAgentKind = agentkind.OpenCode

// openCodeMessageRow holds one assistant message with its session context.
// The scanner reads at message granularity so that each message's tokens are
// attributed to the hourly bucket matching the API call time, not the session
// creation time. This prevents long-running sessions from being dropped by the
// sliding scan window (which is anchored to session.time_created in the old
// session-level query).
type openCodeMessageRow struct {
	SessionID        string
	MsgTimestamp     string // message.time_created — used for bucket + window gate
	Directory        string
	WorkspaceDir     string
	Worktree         string
	SessionModel     string
	TokensInput      int64
	TokensOutput     int64
	TokensReasoning  int64
	TokensCacheRead  int64
	TokensCacheWrite int64
}

func ScanOpenCodeHourlyUsage(ctx context.Context, input ScanInput) ([]HourlyUsageRow, error) {
	databasePaths, err := listOpenCodeDatabasePaths(input.SessionRoot)
	if err != nil {
		return nil, err
	}
	buckets := make(map[hourlyKey]*hourlyAccumulator)
	for _, databasePath := range databasePaths {
		rows, rowErr := queryOpenCodeMessageRows(ctx, databasePath, input.ScanSinceUnixMilli)
		if rowErr != nil {
			continue
		}
		for _, msgRow := range rows {
			applyOpenCodeMessageRow(msgRow, databasePath, input, input.Worktrees, buckets)
		}
	}
	return materializeHourlyRows(buckets, input), nil
}

func listOpenCodeDatabasePaths(sessionRoot string) ([]string, error) {
	dataDir, err := resolveOpenCodeDataDir(sessionRoot)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dataDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read opencode data dir %q: %w", dataDir, err)
	}
	paths := make([]string, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if !strings.HasPrefix(entry.Name(), "opencode") || !strings.HasSuffix(entry.Name(), ".db") {
			continue
		}
		paths = append(paths, filepath.Join(dataDir, entry.Name()))
	}
	sort.Strings(paths)
	return paths, nil
}

func resolveOpenCodeDataDir(sessionRoot string) (string, error) {
	if strings.TrimSpace(sessionRoot) != "" {
		return sessionRoot, nil
	}
	if envDBPath := strings.TrimSpace(os.Getenv("OPENCODE_DB")); envDBPath != "" {
		return filepath.Dir(envDBPath), nil
	}
	if xdgDataHome := strings.TrimSpace(os.Getenv("XDG_DATA_HOME")); xdgDataHome != "" {
		return filepath.Join(xdgDataHome, "opencode"), nil
	}
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve user home dir: %w", err)
	}
	return filepath.Join(homeDir, ".local", "share", "opencode"), nil
}

// queryOpenCodeMessageRows queries the OpenCode SQLite database at message
// granularity. Each returned row represents one assistant message.
//
// The scan window is pushed into SQL (m.time_created >= scanSinceMillis) so
// that SQLite can skip old rows efficiently. scanSinceMillis == 0 means no
// window (full scan).
func queryOpenCodeMessageRows(ctx context.Context, databasePath string, scanSinceMillis int64) ([]openCodeMessageRow, error) {
	windowClause := ""
	if scanSinceMillis > 0 {
		windowClause = "AND m.time_created >= " + strconv.FormatInt(scanSinceMillis, 10)
	}
	query := strings.Join([]string{
		"SELECT",
		"  m.session_id AS session_id,",
		"  m.time_created AS msg_time,",
		"  COALESCE(s.directory, '') AS directory,",
		"  COALESCE(w.directory, '') AS workspace_directory,",
		"  COALESCE(p.worktree, '') AS worktree,",
		"  COALESCE(s.model, 'unknown') AS session_model,",
		"  COALESCE(json_extract(m.data, '$.tokens.input'), 0) AS tokens_input,",
		"  COALESCE(json_extract(m.data, '$.tokens.output'), 0) AS tokens_output,",
		"  COALESCE(json_extract(m.data, '$.tokens.reasoning'), 0) AS tokens_reasoning,",
		"  COALESCE(json_extract(m.data, '$.tokens.cache.read'), 0) AS tokens_cache_read,",
		"  COALESCE(json_extract(m.data, '$.tokens.cache.write'), 0) AS tokens_cache_write",
		"FROM message m",
		"JOIN session s ON s.id = m.session_id",
		"LEFT JOIN workspace w ON w.id = s.workspace_id",
		"LEFT JOIN project p ON p.id = s.project_id",
		"WHERE json_extract(m.data, '$.role') = 'assistant'",
		windowClause,
		"  AND (",
		"    COALESCE(json_extract(m.data, '$.tokens.input'), 0) +",
		"    COALESCE(json_extract(m.data, '$.tokens.output'), 0) +",
		"    COALESCE(json_extract(m.data, '$.tokens.reasoning'), 0) +",
		"    COALESCE(json_extract(m.data, '$.tokens.cache.read'), 0) +",
		"    COALESCE(json_extract(m.data, '$.tokens.cache.write'), 0)",
		"  ) > 0",
		"ORDER BY m.time_created ASC",
	}, " ")

	cmd := exec.CommandContext(ctx, "sqlite3", "-json", databasePath, query)
	rawOutput, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("query opencode database %q: %w", databasePath, err)
	}
	if len(rawOutput) == 0 {
		return nil, nil
	}

	type sqliteRow struct {
		SessionID        string `json:"session_id"`
		MsgTime          any    `json:"msg_time"`
		Directory        string `json:"directory"`
		WorkspaceDir     string `json:"workspace_directory"`
		Worktree         string `json:"worktree"`
		SessionModel     string `json:"session_model"`
		TokensInput      int64  `json:"tokens_input"`
		TokensOutput     int64  `json:"tokens_output"`
		TokensReasoning  int64  `json:"tokens_reasoning"`
		TokensCacheRead  int64  `json:"tokens_cache_read"`
		TokensCacheWrite int64  `json:"tokens_cache_write"`
	}
	parsedRows := make([]sqliteRow, 0)
	if err := json.Unmarshal(rawOutput, &parsedRows); err != nil {
		return nil, fmt.Errorf("parse opencode sqlite result from %q: %w", databasePath, err)
	}
	rows := make([]openCodeMessageRow, 0, len(parsedRows))
	for _, row := range parsedRows {
		rows = append(rows, openCodeMessageRow{
			SessionID:        row.SessionID,
			MsgTimestamp:     parseOpenCodeTimestamp(row.MsgTime),
			Directory:        row.Directory,
			WorkspaceDir:     row.WorkspaceDir,
			Worktree:         row.Worktree,
			SessionModel:     row.SessionModel,
			TokensInput:      row.TokensInput,
			TokensOutput:     row.TokensOutput,
			TokensReasoning:  row.TokensReasoning,
			TokensCacheRead:  row.TokensCacheRead,
			TokensCacheWrite: row.TokensCacheWrite,
		})
	}
	return rows, nil
}

func parseOpenCodeTimestamp(rawValue any) string {
	number, isNumber := rawValue.(float64)
	if !isNumber {
		return ""
	}
	millis := int64(number)
	if millis <= 0 {
		return ""
	}
	return time.UnixMilli(millis).UTC().Format(time.RFC3339Nano)
}

func applyOpenCodeMessageRow(
	msgRow openCodeMessageRow,
	databasePath string,
	input ScanInput,
	worktrees []WorktreeRef,
	buckets map[hourlyKey]*hourlyAccumulator,
) {
	if msgRow.MsgTimestamp == "" {
		return
	}
	msgTime, err := time.Parse(time.RFC3339Nano, msgRow.MsgTimestamp)
	if err != nil {
		return
	}
	// The SQL window clause already filters old rows; this is a belt-and-suspenders
	// guard against clock skew between the Go process and SQLite.
	if isBeforeScanWindow(msgTime, input) {
		return
	}
	cwd := firstNonEmptyPath(msgRow.Directory, msgRow.WorkspaceDir, msgRow.Worktree)
	workspace, confidence := resolveWorktree(cwd, worktrees)
	// Bucket and event timestamp are the message's own time, not the session
	// creation time. This ensures tokens are attributed to the hour the API
	// call actually happened.
	event := codexEvent{
		SessionID: msgRow.SessionID,
		Model:     normalizeOpenCodeModel(msgRow.SessionModel),
		Timestamp: msgTime,
	}
	delta := codexUsage{
		InputTokens:       msgRow.TokensInput + msgRow.TokensCacheRead + msgRow.TokensCacheWrite,
		OutputTokens:      msgRow.TokensOutput,
		CachedInputTokens: msgRow.TokensCacheRead,
		CachedWriteTokens: msgRow.TokensCacheWrite,
		ReasoningTokens:   msgRow.TokensReasoning,
		TotalTokens:       msgRow.TokensInput + msgRow.TokensCacheRead + msgRow.TokensCacheWrite + msgRow.TokensOutput + msgRow.TokensReasoning,
	}
	if delta.TotalTokens <= 0 {
		return
	}
	key := makeOpenCodeHourlyKey(event, workspace, confidence, databasePath)
	acc := getAccumulator(buckets, key)
	accumulateDelta(acc, delta, msgRow.SessionID)
}

func normalizeOpenCodeModel(rawModel string) string {
	trimmed := strings.TrimSpace(rawModel)
	if trimmed == "" {
		return "unknown"
	}

	if !strings.HasPrefix(trimmed, "{") {
		return trimmed
	}

	type modelPayload struct {
		ID         string `json:"id"`
		ModelID    string `json:"modelID"`
		ModelIdAlt string `json:"modelId"`
		ProviderID string `json:"providerID"`
		ProviderId string `json:"providerId"`
	}

	var parsed modelPayload
	if err := json.Unmarshal([]byte(trimmed), &parsed); err != nil {
		return trimmed
	}

	modelID := firstNonEmptyPath(parsed.ModelID, parsed.ModelIdAlt, parsed.ID)
	providerID := firstNonEmptyPath(parsed.ProviderID, parsed.ProviderId)
	if strings.TrimSpace(modelID) == "" {
		return trimmed
	}
	if strings.TrimSpace(providerID) == "" {
		return modelID
	}
	return providerID + "/" + modelID
}

func firstNonEmptyPath(values ...string) string {
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func makeOpenCodeHourlyKey(
	event codexEvent,
	workspace WorktreeRef,
	confidence AttributionConfidence,
	databasePath string,
) hourlyKey {
	bucketTime := event.Timestamp.UTC().Truncate(time.Hour)
	return hourlyKey{
		projectID:   workspace.ProjectID,
		workspaceID: workspace.WorkspaceID,
		workspace:   workspace.WorkspacePath,
		agentKind:   opencodeAgentKind,
		model:       normalizeModel(event.Model),
		bucket:      bucketTime.UnixMilli(),
		confidence:  confidence,
		sourceKind:  SourceKindSQLite,
		sourceID:    databasePath,
	}
}

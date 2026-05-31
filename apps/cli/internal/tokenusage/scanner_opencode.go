package tokenusage

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

const opencodeAgentKind = "opencode"

type openCodeSessionRow struct {
	SessionID       string
	Timestamp       string
	Directory       string
	WorkspaceDir    string
	Worktree        string
	SessionModel    string
	TokensInput     int64
	TokensOutput    int64
	TokensReasoning int64
	TokensCacheRead int64
}

func ScanOpenCodeHourlyUsage(ctx context.Context, input ScanInput) ([]HourlyUsageRow, error) {
	databasePaths, err := listOpenCodeDatabasePaths(input.SessionRoot)
	if err != nil {
		return nil, err
	}
	buckets := make(map[hourlyKey]*hourlyAccumulator)
	for _, databasePath := range databasePaths {
		rows, rowErr := queryOpenCodeSessionRows(ctx, databasePath)
		if rowErr != nil {
			continue
		}
		for _, sessionRow := range rows {
			applyOpenCodeSessionRow(sessionRow, databasePath, input.Worktrees, buckets)
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

func queryOpenCodeSessionRows(ctx context.Context, databasePath string) ([]openCodeSessionRow, error) {
	query := strings.Join([]string{
		"SELECT",
		"  s.id AS session_id,",
		"  s.time_created AS time_created,",
		"  s.directory AS directory,",
		"  COALESCE(w.directory, '') AS workspace_directory,",
		"  COALESCE(p.worktree, '') AS worktree,",
		"  COALESCE(s.model, 'unknown') AS session_model,",
		"  COALESCE(s.tokens_input, 0) AS tokens_input,",
		"  COALESCE(s.tokens_output, 0) AS tokens_output,",
		"  COALESCE(s.tokens_reasoning, 0) AS tokens_reasoning,",
		"  COALESCE(s.tokens_cache_read, 0) AS tokens_cache_read",
		"FROM session s",
		"LEFT JOIN workspace w ON w.id = s.workspace_id",
		"LEFT JOIN project p ON p.id = s.project_id",
		"WHERE COALESCE(s.tokens_input, 0) + COALESCE(s.tokens_output, 0) +",
		"      COALESCE(s.tokens_reasoning, 0) + COALESCE(s.tokens_cache_read, 0) > 0",
		"ORDER BY s.time_created ASC",
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
		SessionID       string `json:"session_id"`
		TimeCreated     any    `json:"time_created"`
		Directory       string `json:"directory"`
		WorkspaceDir    string `json:"workspace_directory"`
		Worktree        string `json:"worktree"`
		SessionModel    string `json:"session_model"`
		TokensInput     int64  `json:"tokens_input"`
		TokensOutput    int64  `json:"tokens_output"`
		TokensReasoning int64  `json:"tokens_reasoning"`
		TokensCacheRead int64  `json:"tokens_cache_read"`
	}
	parsedRows := make([]sqliteRow, 0)
	if err := json.Unmarshal(rawOutput, &parsedRows); err != nil {
		return nil, fmt.Errorf("parse opencode sqlite result from %q: %w", databasePath, err)
	}
	rows := make([]openCodeSessionRow, 0, len(parsedRows))
	for _, row := range parsedRows {
		rows = append(rows, openCodeSessionRow{
			SessionID:       row.SessionID,
			Timestamp:       parseOpenCodeTimestamp(row.TimeCreated),
			Directory:       row.Directory,
			WorkspaceDir:    row.WorkspaceDir,
			Worktree:        row.Worktree,
			SessionModel:    row.SessionModel,
			TokensInput:     row.TokensInput,
			TokensOutput:    row.TokensOutput,
			TokensReasoning: row.TokensReasoning,
			TokensCacheRead: row.TokensCacheRead,
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

func applyOpenCodeSessionRow(
	sessionRow openCodeSessionRow,
	databasePath string,
	worktrees []WorktreeRef,
	buckets map[hourlyKey]*hourlyAccumulator,
) {
	if sessionRow.Timestamp == "" {
		return
	}
	timestamp, err := time.Parse(time.RFC3339Nano, sessionRow.Timestamp)
	if err != nil {
		return
	}
	cwd := firstNonEmptyPath(sessionRow.Directory, sessionRow.WorkspaceDir, sessionRow.Worktree)
	workspace, confidence := resolveWorktree(cwd, worktrees)
	event := codexEvent{SessionID: sessionRow.SessionID, Model: normalizeOpenCodeModel(sessionRow.SessionModel), Timestamp: timestamp}
	delta := codexUsage{
		InputTokens:       sessionRow.TokensInput,
		OutputTokens:      sessionRow.TokensOutput,
		CachedInputTokens: sessionRow.TokensCacheRead,
		ReasoningTokens:   sessionRow.TokensReasoning,
		TotalTokens:       sessionRow.TokensInput + sessionRow.TokensOutput + sessionRow.TokensReasoning,
	}
	if delta.TotalTokens <= 0 {
		return
	}
	key := makeOpenCodeHourlyKey(event, workspace, confidence, databasePath)
	acc := getAccumulator(buckets, key)
	accumulateDelta(acc, delta, sessionRow.SessionID)
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

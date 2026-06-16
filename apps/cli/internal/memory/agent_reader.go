package memory

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"yishan/apps/cli/internal/agentkind"
	_ "modernc.org/sqlite"
)

type agentDBReader struct{}

func newAgentDBReader() *agentDBReader {
	return &agentDBReader{}
}

// ReadRecentSession reads the most recent session for the given agent that
// matches workspacePath. Returns an error for agents whose session format is
// not supported (only opencode and claude store readable conversation text).
func (r *agentDBReader) ReadRecentSession(agent string, workspacePath string) (*sessionMessages, error) {
	switch strings.ToLower(agent) {
	case agentkind.OpenCode:
		return r.readOpenCodeSession(workspacePath)
	case agentkind.Claude:
		return r.readClaudeSession(workspacePath)
	case agentkind.Codex, agentkind.Gemini, agentkind.Copilot, agentkind.Cursor, agentkind.Pi:
		// These agents either store no local conversation text (gemini, copilot,
		// cursor, pi) or store only token usage data without message content
		// (codex .jsonl format). Summarization is not supported for them.
		return nil, fmt.Errorf("agent %q does not store readable conversation text locally", agent)
	default:
		return nil, fmt.Errorf("unknown agent kind: %q", agent)
	}
}

// ── opencode ─────────────────────────────────────────────────────────────────

func (r *agentDBReader) readOpenCodeSession(workspacePath string) (*sessionMessages, error) {
	dataDir, err := resolveOpenCodeDataDir()
	if err != nil {
		return nil, err
	}

	dbPaths, err := listFilesByMtime(dataDir, func(name string) bool {
		return strings.HasPrefix(name, "opencode") && strings.HasSuffix(name, ".db")
	})
	if err != nil || len(dbPaths) == 0 {
		return nil, fmt.Errorf("no opencode databases found in %s", dataDir)
	}

	// Try newest DBs first; stop at first one that has messages for this workspace.
	for i := len(dbPaths) - 1; i >= 0; i-- {
		session, err := readOpenCodeMessages(dbPaths[i], workspacePath)
		if err != nil {
			continue
		}
		if session == nil || len(session.Messages) == 0 {
			continue
		}
		return session, nil
	}

	return nil, fmt.Errorf("no opencode session found for workspace %s", workspacePath)
}

func resolveOpenCodeDataDir() (string, error) {
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

// listFilesByMtime returns files in dir that pass the name filter,
// sorted by modification time ascending (oldest first).
func listFilesByMtime(dir string, nameFilter func(string) bool) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read dir %s: %w", dir, err)
	}

	type fileInfo struct {
		path  string
		mtime time.Time
	}
	var files []fileInfo
	for _, entry := range entries {
		if entry.IsDir() || !nameFilter(entry.Name()) {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		files = append(files, fileInfo{
			path:  filepath.Join(dir, entry.Name()),
			mtime: info.ModTime(),
		})
	}
	sort.Slice(files, func(i, j int) bool {
		return files[i].mtime.Before(files[j].mtime)
	})
	paths := make([]string, len(files))
	for i, f := range files {
		paths[i] = f.path
	}
	return paths, nil
}

func readOpenCodeMessages(dbPath string, workspacePath string) (*sessionMessages, error) {
	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open opencode db %s: %w", dbPath, err)
	}
	defer conn.Close()
	conn.SetMaxOpenConns(1)

	sessionID, err := findLatestOpenCodeSessionID(conn, workspacePath)
	if err != nil {
		return nil, err
	}
	if sessionID == "" {
		return nil, nil
	}

	rows, err := conn.QueryContext(context.Background(), `SELECT m.data, p.data, m.time_created
		FROM message m
		JOIN part p ON p.message_id = m.id
		WHERE m.session_id = ?
		  AND p.session_id = m.session_id
		ORDER BY m.time_created ASC, p.id ASC
		LIMIT 200`, sessionID)
	if err != nil {
		return nil, fmt.Errorf("query opencode messages: %w", err)
	}
	defer rows.Close()

	var messages []sessionMessage
	for rows.Next() {
		var messageDataJSON, partDataJSON string
		var timeCreated int64
		if err := rows.Scan(&messageDataJSON, &partDataJSON, &timeCreated); err != nil {
			continue
		}
		content := extractOpenCodePartText(partDataJSON)
		if content == "" {
			continue
		}
		role := extractOpenCodeRole(messageDataJSON)
		if role == "unknown" {
			continue
		}
		messages = append(messages, sessionMessage{
			Role:      role,
			Content:   content,
			Timestamp: time.UnixMilli(timeCreated),
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &sessionMessages{SessionID: sessionID, Messages: messages}, nil
}

func findLatestOpenCodeSessionID(conn *sql.DB, workspacePath string) (string, error) {
	query := `SELECT id
		FROM session
		ORDER BY time_created DESC
		LIMIT 1`
	args := []any{}
	if workspacePath != "" {
		query = `SELECT id
			FROM session
			WHERE directory = ? OR directory LIKE ?
			ORDER BY time_created DESC
			LIMIT 1`
		args = append(args, workspacePath, workspacePath+"/%")
	}

	var sessionID string
	err := conn.QueryRowContext(context.Background(), query, args...).Scan(&sessionID)
	if err == nil {
		return sessionID, nil
	}
	if err == sql.ErrNoRows {
		return "", nil
	}
	return "", fmt.Errorf("query latest opencode session: %w", err)
}

func extractOpenCodeRole(dataJSON string) string {
	var parsed struct {
		Role string `json:"role"`
	}
	if err := json.Unmarshal([]byte(dataJSON), &parsed); err != nil {
		return "unknown"
	}
	switch strings.ToLower(parsed.Role) {
	case "user", "assistant":
		return strings.ToLower(parsed.Role)
	default:
		return "unknown"
	}
}

func extractOpenCodePartText(dataJSON string) string {
	var parsed struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if err := json.Unmarshal([]byte(dataJSON), &parsed); err != nil {
		return ""
	}
	if parsed.Type != "text" {
		return ""
	}
	return strings.TrimSpace(parsed.Text)
}

// ── claude ───────────────────────────────────────────────────────────────────

func (r *agentDBReader) readClaudeSession(workspacePath string) (*sessionMessages, error) {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("resolve user home dir: %w", err)
	}

	roots := []string{
		filepath.Join(homeDir, ".claude", "projects"),
		filepath.Join(homeDir, ".claude", "transcripts"),
	}

	var jsonlFiles []string
	for _, root := range roots {
		err := filepath.WalkDir(root, func(path string, d os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return nil
			}
			if !d.IsDir() && strings.HasSuffix(d.Name(), ".jsonl") {
				jsonlFiles = append(jsonlFiles, path)
			}
			return nil
		})
		if err != nil && !os.IsNotExist(err) {
			return nil, fmt.Errorf("walk claude transcripts %s: %w", root, err)
		}
	}

	if len(jsonlFiles) == 0 {
		return nil, fmt.Errorf("no claude transcript files found")
	}

	// Sort newest-first by mtime.
	sort.Slice(jsonlFiles, func(i, j int) bool {
		iInfo, iErr := os.Stat(jsonlFiles[i])
		jInfo, jErr := os.Stat(jsonlFiles[j])
		if iErr != nil || jErr != nil {
			return false
		}
		return iInfo.ModTime().After(jInfo.ModTime())
	})

	// Try files newest-first; stop at first one that has messages for this workspace.
	for _, f := range jsonlFiles {
		session, err := readClaudeTranscript(f, workspacePath)
		if err != nil {
			continue
		}
		if len(session.Messages) > 0 {
			return session, nil
		}
	}

	return nil, fmt.Errorf("no claude session found for workspace %s", workspacePath)
}

func readClaudeTranscript(filePath string, workspacePath string) (*sessionMessages, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, fmt.Errorf("read claude transcript %s: %w", filePath, err)
	}

	sessionID := strings.TrimSuffix(filepath.Base(filePath), ".jsonl")
	var messages []sessionMessage

	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		var record struct {
			Role      string `json:"role"`
			Content   string `json:"content"`
			Timestamp string `json:"timestamp"`
			CWD       string `json:"cwd"`
		}
		if err := json.Unmarshal([]byte(line), &record); err != nil {
			continue
		}

		// Filter by workspace if specified.
		if workspacePath != "" && record.CWD != "" {
			if !strings.HasPrefix(record.CWD, workspacePath) {
				continue
			}
		}

		if record.Role != "user" && record.Role != "assistant" {
			continue
		}
		if record.Content == "" {
			continue
		}

		ts, _ := time.Parse(time.RFC3339Nano, record.Timestamp)
		messages = append(messages, sessionMessage{
			Role:      record.Role,
			Content:   record.Content,
			Timestamp: ts,
		})
	}

	return &sessionMessages{SessionID: sessionID, Messages: messages}, nil
}

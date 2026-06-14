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

	_ "modernc.org/sqlite"
)

type agentDBReader struct{}

func newAgentDBReader() *agentDBReader {
	return &agentDBReader{}
}

func (r *agentDBReader) ReadRecentSession(agent string, workspacePath string) (*sessionMessages, error) {
	switch strings.ToLower(agent) {
	case "opencode":
		return r.readOpenCodeSession(workspacePath)
	case "claude":
		return r.readClaudeSession(workspacePath)
	default:
		return nil, fmt.Errorf("unsupported agent for session reading: %s", agent)
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
		messages, err := readOpenCodeMessages(dbPaths[i], workspacePath)
		if err != nil {
			continue
		}
		if len(messages) == 0 {
			continue
		}
		sessionID := strings.TrimSuffix(filepath.Base(dbPaths[i]), ".db")
		return &sessionMessages{SessionID: sessionID, Messages: messages}, nil
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

func readOpenCodeMessages(dbPath string, workspacePath string) ([]sessionMessage, error) {
	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open opencode db %s: %w", dbPath, err)
	}
	defer conn.Close()
	conn.SetMaxOpenConns(1)

	// Filter to the session whose directory matches workspacePath.
	// Fall back to no filter if workspacePath is empty.
	var (
		query string
		args  []any
	)
	if workspacePath != "" {
		query = `SELECT p.type, p.data, m.time_created
			FROM part p
			JOIN message m ON p.message_id = m.id
			JOIN session s ON m.session_id = s.id
			WHERE p.type = 'text'
			  AND (s.directory = ? OR s.directory LIKE ?)
			ORDER BY m.time_created ASC, p.id ASC
			LIMIT 200`
		args = []any{workspacePath, workspacePath + "/%"}
	} else {
		query = `SELECT p.type, p.data, m.time_created
			FROM part p
			JOIN message m ON p.message_id = m.id
			WHERE p.type = 'text'
			ORDER BY m.time_created ASC, p.id ASC
			LIMIT 200`
	}

	rows, err := conn.QueryContext(context.Background(), query, args...)
	if err != nil {
		return nil, fmt.Errorf("query opencode messages: %w", err)
	}
	defer rows.Close()

	var messages []sessionMessage
	for rows.Next() {
		var partType, dataJSON string
		var timeCreated int64
		if err := rows.Scan(&partType, &dataJSON, &timeCreated); err != nil {
			continue
		}
		content := extractContentFromData(dataJSON)
		if content == "" {
			continue
		}
		role := extractRole(dataJSON)
		messages = append(messages, sessionMessage{
			Role:      role,
			Content:   content,
			Timestamp: time.UnixMilli(timeCreated),
		})
	}
	return messages, rows.Err()
}

func extractRole(dataJSON string) string {
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

func extractContentFromData(dataJSON string) string {
	var parsed struct {
		Content any `json:"content"`
	}
	if err := json.Unmarshal([]byte(dataJSON), &parsed); err != nil {
		return ""
	}

	switch c := parsed.Content.(type) {
	case string:
		return c
	case []any:
		var parts []string
		for _, item := range c {
			m, ok := item.(map[string]any)
			if !ok {
				continue
			}
			if t, _ := m["type"].(string); t == "text" {
				if text, _ := m["text"].(string); text != "" {
					parts = append(parts, text)
				}
			}
		}
		return strings.Join(parts, "\n")
	}
	return ""
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

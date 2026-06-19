package memory

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// isSummarizeJobSession returns true when the session is a yishan background
// summarization job rather than a real user session. These sessions are created
// by the daemon calling the agent CLI non-interactively to summarize MEMORY.md.
// They are identified by their first user message starting with the known
// summarization prompt prefix, which should never appear in real user sessions.
//
// The prefix is also matched with a leading quote character ("Summarize...) because
// the daemon passes the prompt as a JSON-encoded argument, causing opencode to
// store it with an escaped leading quote in the SQLite text field.
func isSummarizeJobSession(session *sessionMessages) bool {
	const summarizePrefix = "Summarize the following AI coding conversation for a developer's project memory file."
	for _, msg := range session.Messages {
		if msg.Role == "user" {
			text := strings.TrimSpace(msg.Content)
			// Match both raw and JSON-escaped variants.
			return strings.HasPrefix(text, summarizePrefix) ||
				strings.HasPrefix(text, `"`+summarizePrefix)
		}
	}
	return false
}

// ReadSessionsForDate returns all sessions from the given UTC date for the
// specified agent. Used by the daily persona batch extractor to collect all
// sessions from the previous day across all workspaces.
func (r *agentDBReader) ReadSessionsForDate(agent string, date time.Time) ([]*sessionMessages, error) {
	switch strings.ToLower(agent) {
	case "opencode":
		return r.readOpenCodeSessionsForDate(date)
	case "claude":
		return r.readClaudeSessionsForDate(date)
	default:
		return nil, fmt.Errorf("agent %q does not support date-range session reading", agent)
	}
}

// dayBoundsMs returns the start (inclusive) and end (inclusive) of the given UTC
// date as millisecond Unix timestamps, matching opencode's time_created column type.
func dayBoundsMs(date time.Time) (int64, int64) {
	y, m, d := date.UTC().Date()
	start := time.Date(y, m, d, 0, 0, 0, 0, time.UTC)
	end := time.Date(y, m, d, 23, 59, 59, 999999999, time.UTC)
	return start.UnixMilli(), end.UnixMilli()
}

// ── opencode date-range ───────────────────────────────────────────────────────

// readOpenCodeSessionsForDate returns all sessions recorded on the given UTC date
// from the single opencode SQLite database. Each session is returned as a separate
// *sessionMessages so the caller can process them independently.
func (r *agentDBReader) readOpenCodeSessionsForDate(date time.Time) ([]*sessionMessages, error) {
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

	// opencode uses a single DB — use the newest one.
	dbPath := dbPaths[len(dbPaths)-1]
	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open opencode db %s: %w", dbPath, err)
	}
	defer conn.Close()
	conn.SetMaxOpenConns(1)

	startMs, endMs := dayBoundsMs(date)

	// Collect session IDs in a first pass and close the rows before querying
	// messages. SQLite with MaxOpenConns(1) does not support two concurrent
	// active result sets on the same connection.
	sessionIDs, err := queryOpenCodeSessionIDsForDate(conn, startMs, endMs)
	if err != nil {
		return nil, err
	}

	var results []*sessionMessages
	for _, sid := range sessionIDs {
		msgs, err := readOpenCodeMessagesForSession(conn, sid)
		if err != nil || len(msgs.Messages) == 0 {
			continue
		}
		if isSummarizeJobSession(msgs) {
			continue
		}
		results = append(results, msgs)
	}
	return results, nil
}

// queryOpenCodeSessionIDsForDate fetches session IDs within [startMs, endMs]
// and returns them fully materialized so the caller can reuse the connection.
func queryOpenCodeSessionIDsForDate(conn *sql.DB, startMs, endMs int64) ([]string, error) {
	rows, err := conn.QueryContext(context.Background(),
		`SELECT id FROM session WHERE time_created BETWEEN ? AND ? ORDER BY time_created ASC`,
		startMs, endMs)
	if err != nil {
		return nil, fmt.Errorf("query opencode sessions for date: %w", err)
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			continue
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// readOpenCodeMessagesForSession reads all text messages for a specific session ID.
func readOpenCodeMessagesForSession(conn *sql.DB, sessionID string) (*sessionMessages, error) {
	rows, err := conn.QueryContext(context.Background(), `SELECT m.data, p.data, m.time_created
		FROM message m
		JOIN part p ON p.message_id = m.id
		WHERE m.session_id = ?
		  AND p.session_id = m.session_id
		ORDER BY m.time_created ASC, p.id ASC
		LIMIT 200`, sessionID)
	if err != nil {
		return nil, fmt.Errorf("query messages for session %s: %w", sessionID, err)
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

// ── claude date-range ─────────────────────────────────────────────────────────

// readClaudeSessionsForDate returns all claude sessions whose messages fall on
// the given UTC date, scanning all .jsonl transcript files.
func (r *agentDBReader) readClaudeSessionsForDate(date time.Time) ([]*sessionMessages, error) {
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

	startMs, endMs := dayBoundsMs(date)
	startTime := time.UnixMilli(startMs).UTC()
	endTime := time.UnixMilli(endMs).UTC()

	var results []*sessionMessages
	for _, f := range jsonlFiles {
		session, err := readClaudeTranscriptForDateRange(f, startTime, endTime)
		if err != nil || len(session.Messages) == 0 {
			continue
		}
		if isSummarizeJobSession(session) {
			continue
		}
		results = append(results, session)
	}
	return results, nil
}

// readClaudeTranscriptForDateRange reads a claude .jsonl file and returns only
// messages whose timestamps fall within [start, end].
func readClaudeTranscriptForDateRange(filePath string, start, end time.Time) (*sessionMessages, error) {
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
		}
		if err := json.Unmarshal([]byte(line), &record); err != nil {
			continue
		}

		ts, err := time.Parse(time.RFC3339Nano, record.Timestamp)
		if err != nil {
			continue
		}
		ts = ts.UTC()
		if ts.Before(start) || ts.After(end) {
			continue
		}
		if record.Role != "user" && record.Role != "assistant" {
			continue
		}
		if record.Content == "" {
			continue
		}
		messages = append(messages, sessionMessage{
			Role:      record.Role,
			Content:   record.Content,
			Timestamp: ts,
		})
	}

	return &sessionMessages{SessionID: sessionID, Messages: messages}, nil
}

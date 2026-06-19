package memory

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestReadOpenCodeMessages_UsesLatestMatchingSession(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "opencode.db")
	conn := openTestSQLite(t, dbPath)
	defer conn.Close()
	createOpenCodeSchema(t, conn)

	workspacePath := "/tmp/workspace"
	insertOpenCodeSession(t, conn, "ses-older", workspacePath, 1000)
	insertOpenCodeSession(t, conn, "ses-newer", workspacePath, 2000)
	insertOpenCodeMessagePart(t, conn, "msg-older", "part-older", "ses-older", 1000, `{"role":"user"}`, `{"type":"text","text":"older"}`)
	insertOpenCodeMessagePart(t, conn, "msg-newer", "part-newer", "ses-newer", 2000, `{"role":"assistant"}`, `{"type":"text","text":"newer"}`)

	session, err := readOpenCodeMessages(dbPath, workspacePath)
	if err != nil {
		t.Fatalf("readOpenCodeMessages: %v", err)
	}
	if session == nil {
		t.Fatal("expected session")
	}
	if session.SessionID != "ses-newer" {
		t.Fatalf("expected latest session id, got %q", session.SessionID)
	}
	if len(session.Messages) != 1 {
		t.Fatalf("expected 1 message, got %d", len(session.Messages))
	}
	if session.Messages[0].Role != "assistant" || session.Messages[0].Content != "newer" {
		t.Fatalf("unexpected message: %+v", session.Messages[0])
	}
	if !session.Messages[0].Timestamp.Equal(time.UnixMilli(2000)) {
		t.Fatalf("unexpected timestamp: %v", session.Messages[0].Timestamp)
	}
}

func TestReadOpenCodeMessages_ReadsLiveJSONTextParts(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "opencode.db")
	conn := openTestSQLite(t, dbPath)
	defer conn.Close()
	createOpenCodeSchema(t, conn)

	workspacePath := "/tmp/workspace"
	insertOpenCodeSession(t, conn, "ses-1", workspacePath, 1000)
	insertOpenCodeMessagePart(t, conn, "msg-1", "part-1", "ses-1", 1000, `{"role":"user"}`, `{"type":"text","text":"hello"}`)
	insertOpenCodeMessagePart(t, conn, "msg-2", "part-2", "ses-1", 2000, `{"role":"assistant"}`, `{"type":"text","text":"world"}`)

	session, err := readOpenCodeMessages(dbPath, workspacePath)
	if err != nil {
		t.Fatalf("readOpenCodeMessages: %v", err)
	}
	if session == nil || len(session.Messages) != 2 {
		t.Fatalf("expected 2 messages, got %+v", session)
	}
	if session.Messages[0].Role != "user" || session.Messages[0].Content != "hello" {
		t.Fatalf("unexpected first message: %+v", session.Messages[0])
	}
	if session.Messages[1].Role != "assistant" || session.Messages[1].Content != "world" {
		t.Fatalf("unexpected second message: %+v", session.Messages[1])
	}
}

func openTestSQLite(t *testing.T, dbPath string) *sql.DB {
	t.Helper()
	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	conn.SetMaxOpenConns(1)
	return conn
}

func createOpenCodeSchema(t *testing.T, conn *sql.DB) {
	t.Helper()
	statements := []string{
		`CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT NOT NULL, time_created INTEGER NOT NULL)`,
		`CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, time_created INTEGER NOT NULL, data TEXT NOT NULL)`,
		`CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT NOT NULL, session_id TEXT NOT NULL, time_created INTEGER NOT NULL, data TEXT NOT NULL)`,
	}
	for _, statement := range statements {
		if _, err := conn.Exec(statement); err != nil {
			t.Fatalf("exec schema %q: %v", statement, err)
		}
	}
}

func insertOpenCodeSession(t *testing.T, conn *sql.DB, sessionID string, directory string, timeCreated int64) {
	t.Helper()
	if _, err := conn.Exec(`INSERT INTO session (id, directory, time_created) VALUES (?, ?, ?)`, sessionID, directory, timeCreated); err != nil {
		t.Fatalf("insert session: %v", err)
	}
}

func insertOpenCodeMessagePart(t *testing.T, conn *sql.DB, messageID string, partID string, sessionID string, timeCreated int64, messageData string, partData string) {
	t.Helper()
	if _, err := conn.Exec(`INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)`, messageID, sessionID, timeCreated, messageData); err != nil {
		t.Fatalf("insert message: %v", err)
	}
	if _, err := conn.Exec(`INSERT INTO part (id, message_id, session_id, time_created, data) VALUES (?, ?, ?, ?, ?)`, partID, messageID, sessionID, timeCreated, partData); err != nil {
		t.Fatalf("insert part: %v", err)
	}
}

// ── dayBoundsMs ───────────────────────────────────────────────────────────────

func TestDayBoundsMs_startAndEnd(t *testing.T) {
	date := time.Date(2026, 6, 18, 0, 0, 0, 0, time.UTC)
	start, end := dayBoundsMs(date)
	startTime := time.UnixMilli(start).UTC()
	endTime := time.UnixMilli(end).UTC()

	if startTime.Hour() != 0 || startTime.Minute() != 0 || startTime.Second() != 0 {
		t.Errorf("start should be midnight UTC, got %v", startTime)
	}
	if endTime.Hour() != 23 || endTime.Minute() != 59 || endTime.Second() != 59 {
		t.Errorf("end should be 23:59:59 UTC, got %v", endTime)
	}
	if startTime.Day() != 18 || endTime.Day() != 18 {
		t.Errorf("both bounds should be day 18, got %v and %v", startTime, endTime)
	}
}

func TestDayBoundsMs_startBeforeEnd(t *testing.T) {
	start, end := dayBoundsMs(time.Now())
	if start >= end {
		t.Errorf("start should be before end: %d >= %d", start, end)
	}
}

// ── readOpenCodeSessionsForDate (via readOpenCodeMessagesForSession) ──────────

func TestReadOpenCodeMessagesForSession_basic(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "opencode.db")
	conn := openTestSQLite(t, dbPath)
	defer conn.Close()
	createOpenCodeSchema(t, conn)

	insertOpenCodeSession(t, conn, "ses-a", "/workspace", 1000)
	insertOpenCodeMessagePart(t, conn, "msg-a1", "part-a1", "ses-a", 1000, `{"role":"user"}`, `{"type":"text","text":"hi"}`)
	insertOpenCodeMessagePart(t, conn, "msg-a2", "part-a2", "ses-a", 2000, `{"role":"assistant"}`, `{"type":"text","text":"hello"}`)

	result, err := readOpenCodeMessagesForSession(conn, "ses-a")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.SessionID != "ses-a" {
		t.Errorf("SessionID: got %q", result.SessionID)
	}
	if len(result.Messages) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(result.Messages))
	}
}

func TestReadOpenCodeMessagesForSession_emptySession(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "opencode.db")
	conn := openTestSQLite(t, dbPath)
	defer conn.Close()
	createOpenCodeSchema(t, conn)

	result, err := readOpenCodeMessagesForSession(conn, "no-such-session")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Messages) != 0 {
		t.Errorf("expected 0 messages for unknown session, got %d", len(result.Messages))
	}
}

// TestQueryOpenCodeSessionIDsForDate verifies the date-range query materializes
// IDs correctly without leaving an open result set.
func TestQueryOpenCodeSessionIDsForDate(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "opencode.db")
	conn := openTestSQLite(t, dbPath)
	defer conn.Close()
	createOpenCodeSchema(t, conn)

	date := time.Date(2026, 6, 18, 0, 0, 0, 0, time.UTC)
	startMs, endMs := dayBoundsMs(date)

	// Insert one session in range and one out of range.
	insertOpenCodeSession(t, conn, "in-range", "/ws", startMs+1000)
	insertOpenCodeSession(t, conn, "out-range", "/ws", endMs+1000)

	ids, err := queryOpenCodeSessionIDsForDate(conn, startMs, endMs)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(ids) != 1 || ids[0] != "in-range" {
		t.Errorf("expected [in-range], got %v", ids)
	}

	// Verify the connection is still usable (no dangling result set).
	var count int
	if err := conn.QueryRowContext(context.Background(), "SELECT COUNT(*) FROM session").Scan(&count); err != nil {
		t.Fatalf("connection unusable after queryOpenCodeSessionIDsForDate: %v", err)
	}
}

// ── readClaudeTranscriptForDateRange ─────────────────────────────────────────

func TestReadClaudeTranscriptForDateRange_filtersOutOfRange(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "session1.jsonl")

	targetDate := time.Date(2026, 6, 18, 0, 0, 0, 0, time.UTC)
	start, end := dayBoundsMs(targetDate)
	startTime := time.UnixMilli(start).UTC()
	endTime := time.UnixMilli(end).UTC()

	// One message in range, one out of range (day before, day after).
	lines := []string{
		fmt.Sprintf(`{"role":"user","content":"in range","timestamp":"%s"}`,
			time.Date(2026, 6, 18, 12, 0, 0, 0, time.UTC).Format(time.RFC3339Nano)),
		fmt.Sprintf(`{"role":"user","content":"too early","timestamp":"%s"}`,
			time.Date(2026, 6, 17, 23, 59, 0, 0, time.UTC).Format(time.RFC3339Nano)),
		fmt.Sprintf(`{"role":"user","content":"too late","timestamp":"%s"}`,
			time.Date(2026, 6, 19, 0, 1, 0, 0, time.UTC).Format(time.RFC3339Nano)),
	}
	content := ""
	for _, l := range lines {
		content += l + "\n"
	}
	if err := os.WriteFile(file, []byte(content), 0o644); err != nil {
		t.Fatalf("write test file: %v", err)
	}

	result, err := readClaudeTranscriptForDateRange(file, startTime, endTime)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Messages) != 1 {
		t.Fatalf("expected 1 message in range, got %d: %v", len(result.Messages), result.Messages)
	}
	if result.Messages[0].Content != "in range" {
		t.Errorf("unexpected message content: %q", result.Messages[0].Content)
	}
}

func TestReadClaudeTranscriptForDateRange_emptyFile(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "empty.jsonl")
	if err := os.WriteFile(file, []byte(""), 0o644); err != nil {
		t.Fatalf("write test file: %v", err)
	}
	result, err := readClaudeTranscriptForDateRange(file, time.Now().Add(-time.Hour), time.Now())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Messages) != 0 {
		t.Errorf("expected 0 messages for empty file, got %d", len(result.Messages))
	}
}

// ── isSummarizeJobSession ─────────────────────────────────────────────────────

func TestIsSummarizeJobSession_realSession(t *testing.T) {
	session := &sessionMessages{
		Messages: []sessionMessage{
			{Role: "user", Content: "Fix the keyboard shortcut ordering bug"},
			{Role: "assistant", Content: "Let me look at the code..."},
		},
	}
	if isSummarizeJobSession(session) {
		t.Error("real user session should not be identified as summarize job")
	}
}

func TestIsSummarizeJobSession_summarizeJob(t *testing.T) {
	session := &sessionMessages{
		Messages: []sessionMessage{
			{Role: "user", Content: "Summarize the following AI coding conversation for a developer's project memory file. Extract only technical decisions..."},
			{Role: "assistant", Content: `{"decisions":["used Immer for state"]}`},
		},
	}
	if !isSummarizeJobSession(session) {
		t.Error("summarize job session should be identified as such")
	}
}

func TestIsSummarizeJobSession_summarizeJobQuoteEscaped(t *testing.T) {
	// The daemon passes the prompt as a JSON arg causing opencode to store it
	// with a leading escaped quote in the SQLite text field.
	session := &sessionMessages{
		Messages: []sessionMessage{
			{Role: "user", Content: `"Summarize the following AI coding conversation for a developer's project memory file. Extract only technical decisions..."`},
			{Role: "assistant", Content: `{"decisions":["used Immer for state"]}`},
		},
	}
	if !isSummarizeJobSession(session) {
		t.Error("quote-escaped summarize job session should be identified as such")
	}
}

func TestIsSummarizeJobSession_emptySession(t *testing.T) {
	session := &sessionMessages{}
	if isSummarizeJobSession(session) {
		t.Error("empty session should not be identified as summarize job")
	}
}

func TestIsSummarizeJobSession_assistantOnly(t *testing.T) {
	session := &sessionMessages{
		Messages: []sessionMessage{
			{Role: "assistant", Content: "Summarize the following AI coding conversation..."},
		},
	}
	if isSummarizeJobSession(session) {
		t.Error("should not match if only assistant message has the prefix (no user message)")
	}
}

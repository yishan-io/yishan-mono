package memory

import (
	"database/sql"
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

package memory

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	_ "modernc.org/sqlite"
)

type DB struct {
	mu   sync.RWMutex
	conn *sql.DB
	path string
}

func OpenDB(dbPath string) (*DB, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		return nil, fmt.Errorf("create memory db directory: %w", err)
	}

	conn, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open memory database: %w", err)
	}

	conn.SetMaxOpenConns(1)

	if err := migrate(conn); err != nil {
		conn.Close()
		return nil, fmt.Errorf("migrate memory database: %w", err)
	}

	return &DB{conn: conn, path: dbPath}, nil
}

func OpenReadOnly(dbPath string) (*DB, error) {
	conn, err := sql.Open("sqlite", "file:"+dbPath+"?mode=ro")
	if err != nil {
		return nil, fmt.Errorf("open read-only memory database: %w", err)
	}

	conn.SetMaxOpenConns(1)

	return &DB{conn: conn, path: dbPath}, nil
}

func (db *DB) Close() error {
	db.mu.Lock()
	defer db.mu.Unlock()
	return db.conn.Close()
}

func (db *DB) Path() string {
	return db.path
}

func migrate(conn *sql.DB) error {
	_, err := conn.Exec(`CREATE TABLE IF NOT EXISTS memory_files (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		path TEXT UNIQUE NOT NULL,
		project_path TEXT NOT NULL DEFAULT '',
		project_id TEXT NOT NULL DEFAULT '',
		type TEXT NOT NULL,
		body TEXT NOT NULL,
		fingerprint TEXT NOT NULL,
		indexed_at INTEGER NOT NULL
	)`)
	if err != nil {
		return fmt.Errorf("create memory_files table: %w", err)
	}

	// Additive migration: add project_id if it doesn't exist yet (schema v1 → v2).
	_, _ = conn.Exec(`ALTER TABLE memory_files ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`)

	_, err = conn.Exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
		path, type, body,
		content='memory_files',
		content_rowid='id'
	)`)
	if err != nil {
		return fmt.Errorf("create memory_fts table: %w", err)
	}

	// Triggers to keep memory_fts in sync with memory_files.
	// Required because FTS5 content tables do not auto-update.
	if err := createFTSTriggers(conn); err != nil {
		return err
	}

	_, err = conn.Exec(`CREATE INDEX IF NOT EXISTS idx_memory_files_project_path ON memory_files(project_path)`)
	if err != nil {
		return fmt.Errorf("create project_path index: %w", err)
	}

	_, err = conn.Exec(`CREATE INDEX IF NOT EXISTS idx_memory_files_project_id ON memory_files(project_id)`)
	if err != nil {
		return fmt.Errorf("create project_id index: %w", err)
	}

	_, err = conn.Exec(`CREATE INDEX IF NOT EXISTS idx_memory_files_type ON memory_files(type)`)
	if err != nil {
		return fmt.Errorf("create type index: %w", err)
	}

	// Rebuild FTS index to pick up any rows that existed before the triggers were
	// added (covers first-run and schema v1 → v2 upgrades).
	if _, err := conn.Exec(`INSERT INTO memory_fts(memory_fts) VALUES('rebuild')`); err != nil {
		return fmt.Errorf("rebuild fts5 index: %w", err)
	}

	return nil
}

func createFTSTriggers(conn *sql.DB) error {
	stmts := []string{
		// After INSERT: add the new row to FTS.
		`CREATE TRIGGER IF NOT EXISTS memory_files_ai AFTER INSERT ON memory_files BEGIN
			INSERT INTO memory_fts(rowid, path, type, body)
			VALUES (new.id, new.path, new.type, new.body);
		END`,
		// After UPDATE: remove old FTS entry, insert new one.
		`CREATE TRIGGER IF NOT EXISTS memory_files_au AFTER UPDATE ON memory_files BEGIN
			INSERT INTO memory_fts(memory_fts, rowid, path, type, body)
			VALUES ('delete', old.id, old.path, old.type, old.body);
			INSERT INTO memory_fts(rowid, path, type, body)
			VALUES (new.id, new.path, new.type, new.body);
		END`,
		// After DELETE: remove the row from FTS.
		`CREATE TRIGGER IF NOT EXISTS memory_files_ad AFTER DELETE ON memory_files BEGIN
			INSERT INTO memory_fts(memory_fts, rowid, path, type, body)
			VALUES ('delete', old.id, old.path, old.type, old.body);
		END`,
	}
	for _, stmt := range stmts {
		if _, err := conn.Exec(stmt); err != nil {
			return fmt.Errorf("create fts trigger: %w", err)
		}
	}
	return nil
}

func (db *DB) UpsertFile(file MemoryFile) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	_, err := db.conn.Exec(
		`INSERT OR REPLACE INTO memory_files (path, project_path, project_id, type, body, fingerprint, indexed_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		file.Path, file.ProjectPath, file.ProjectID, string(file.Type), file.Body, file.Fingerprint, file.IndexedAt,
	)
	return err
}

func (db *DB) DeleteByPath(path string) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	_, err := db.conn.Exec(`DELETE FROM memory_files WHERE path = ?`, path)
	return err
}

func (db *DB) GetByPath(path string) (MemoryFile, bool, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	var file MemoryFile
	var fileType string
	err := db.conn.QueryRow(
		`SELECT id, path, project_path, project_id, type, body, fingerprint, indexed_at FROM memory_files WHERE path = ?`,
		path,
	).Scan(&file.ID, &file.Path, &file.ProjectPath, &file.ProjectID, &fileType, &file.Body, &file.Fingerprint, &file.IndexedAt)
	if err == sql.ErrNoRows {
		return MemoryFile{}, false, nil
	}
	if err != nil {
		return MemoryFile{}, false, err
	}
	file.Type = FileType(fileType)
	return file, true, nil
}

func (db *DB) AllPaths() ([]string, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	rows, err := db.conn.Query(`SELECT path FROM memory_files`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var paths []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return nil, err
		}
		paths = append(paths, p)
	}
	return paths, rows.Err()
}

func (db *DB) DeleteAllNotIn(paths []string) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	if len(paths) == 0 {
		_, err := db.conn.Exec(`DELETE FROM memory_files`)
		return err
	}

	query := `DELETE FROM memory_files WHERE path NOT IN (`
	args := make([]any, len(paths))
	for i, p := range paths {
		if i > 0 {
			query += ", "
		}
		query += "?"
		args[i] = p
	}
	query += ")"

	_, err := db.conn.Exec(query, args...)
	return err
}

func (db *DB) Search(query string, projectID string, fileType FileType, limit int) ([]MemorySearchResult, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	ftsQuery := escapeFTS5(query)
	stmt := `SELECT m.path, snippet(memory_fts, 2, '<mark>', '</mark>', '...', 40), rank
		FROM memory_fts
		JOIN memory_files m ON memory_fts.rowid = m.id
		WHERE memory_fts MATCH '` + escapeSQLString(ftsQuery) + `'`
	args := []any{}

	if projectID != "" {
		stmt += ` AND m.project_id = ?`
		args = append(args, projectID)
	}
	if fileType != "" {
		stmt += ` AND m.type = ?`
		args = append(args, string(fileType))
	}

	stmt += ` ORDER BY rank LIMIT ?`
	args = append(args, limit)

	rows, err := db.conn.Query(stmt, args...)
	if err != nil {
		return nil, fmt.Errorf("fts5 search: %w", err)
	}
	defer rows.Close()

	var results []MemorySearchResult
	for rows.Next() {
		var r MemorySearchResult
		if err := rows.Scan(&r.Path, &r.Snippet, &r.Score); err != nil {
			return nil, err
		}
		results = append(results, r)
	}
	return results, rows.Err()
}

// escapeFTS5 converts a user query into an FTS5 MATCH expression.
// Each whitespace-separated token is individually quoted and OR-joined so that
// "permission deadlock" matches any document containing either word, not only
// documents where both words appear adjacently (phrase match).
// A single-token query produces the same output as before: "token".
// An empty query returns "" (callers guard against empty queries).
func escapeFTS5(query string) string {
	tokens := strings.Fields(query)
	if len(tokens) == 0 {
		return `""`
	}
	parts := make([]string, len(tokens))
	for i, tok := range tokens {
		parts[i] = `"` + strings.ReplaceAll(tok, `"`, `""`) + `"`
	}
	return strings.Join(parts, " OR ")
}

func escapeSQLString(s string) string {
	return strings.ReplaceAll(s, "'", "''")
}

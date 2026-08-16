// Package db provides durable local SQLite storage for daemon-managed data.
package db

import (
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	_ "modernc.org/sqlite"
)

const databaseFileName = "yishan.db"

// legacyProfileFileNames are pre-SQLite state files that no longer have any
// code references. They are removed on every DB open so old profiles converge
// on the SQLite-only layout (same pattern as cleanupLegacyMetadataKeys).
var legacyProfileFileNames = []string{
	"workspace-index.json",
	"token-usage-hourly.json.migrated",
}

//go:embed migrations/*.sql
var migrationFiles embed.FS

// Open opens the profile-local daemon database with the required SQLite settings.
func Open(profileDir string) (*sql.DB, error) {
	if err := os.MkdirAll(profileDir, 0o755); err != nil {
		return nil, fmt.Errorf("create database directory: %w", err)
	}

	database, err := sql.Open("sqlite", filepath.Join(profileDir, databaseFileName))
	if err != nil {
		return nil, fmt.Errorf("open local database: %w", err)
	}
	if err := configure(database); err != nil {
		_ = database.Close() // cleanup after unsuccessful configuration
		return nil, err
	}
	return database, nil
}

// OpenReadOnly opens the profile-local daemon database in read-only mode.
func OpenReadOnly(profileDir string) (*sql.DB, error) {
	database, err := sql.Open("sqlite", "file:"+filepath.Join(profileDir, databaseFileName)+"?mode=ro")
	if err != nil {
		return nil, fmt.Errorf("open local database read-only: %w", err)
	}
	database.SetMaxOpenConns(1)
	return database, nil
}

func configure(database *sql.DB) error {
	database.SetMaxOpenConns(1)
	for _, pragma := range []string{"PRAGMA journal_mode=WAL", "PRAGMA foreign_keys=ON", "PRAGMA busy_timeout=5000"} {
		if _, err := database.Exec(pragma); err != nil {
			return fmt.Errorf("configure SQLite database: %w", err)
		}
	}
	return nil
}

// Migrate applies embedded migrations exactly once, in lexical filename order.
func Migrate(database *sql.DB) error {
	if _, err := database.Exec(`CREATE TABLE IF NOT EXISTS _migrations (
		name TEXT PRIMARY KEY,
		applied_at TEXT NOT NULL DEFAULT (datetime('now'))
	)`); err != nil {
		return fmt.Errorf("create migration table: %w", err)
	}

	migrationNames, err := migrationNames()
	if err != nil {
		return err
	}
	for _, migrationName := range migrationNames {
		if err := applyMigration(database, migrationName); err != nil {
			return err
		}
	}
	if err := cleanupLegacyMetadataKeys(database); err != nil {
		return err
	}
	return nil
}

// CleanupLegacyProfileFiles removes profile-local files whose data has moved
// into SQLite and that have no remaining code references. Missing files are
// silently ignored so fresh profiles are unaffected. It runs on every daemon
// database open, alongside the in-DB legacy metadata cleanup.
func CleanupLegacyProfileFiles(profileDir string) error {
	if profileDir == "" {
		return nil
	}
	for _, name := range legacyProfileFileNames {
		path := filepath.Join(profileDir, name)
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove legacy profile file %q: %w", path, err)
		}
	}
	return nil
}

func migrationNames() ([]string, error) {
	entries, err := fs.ReadDir(migrationFiles, "migrations")
	if err != nil {
		return nil, fmt.Errorf("read embedded migrations: %w", err)
	}

	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)
	return names, nil
}

func applyMigration(database *sql.DB, migrationName string) error {
	isApplied, err := migrationApplied(database, migrationName)
	if err != nil {
		return err
	}
	if isApplied {
		return nil
	}

	migrationSQL, err := migrationFiles.ReadFile(filepath.Join("migrations", migrationName))
	if err != nil {
		return fmt.Errorf("read migration %q: %w", migrationName, err)
	}
	// SQLite cannot change foreign_keys inside a transaction, and table-rebuild
	// migrations (dropping a FK / table) need FK checks off so DROP TABLE does
	// not cascade-delete child rows. The pool is single-connection
	// (configure sets MaxOpenConns(1)), so this pragma is reliable for the
	// transaction below.
	if _, err := database.Exec(`PRAGMA foreign_keys=OFF`); err != nil {
		return fmt.Errorf("disable foreign keys for migration %q: %w", migrationName, err)
	}
	defer func() {
		_, _ = database.Exec(`PRAGMA foreign_keys=ON`)
	}()
	transaction, err := database.Begin()
	if err != nil {
		return fmt.Errorf("begin migration %q: %w", migrationName, err)
	}
	if _, err := transaction.Exec(string(migrationSQL)); err != nil {
		_ = transaction.Rollback() // preserve the original migration error
		return fmt.Errorf("apply migration %q: %w", migrationName, err)
	}
	if _, err := transaction.Exec(`INSERT INTO _migrations (name) VALUES (?)`, migrationName); err != nil {
		_ = transaction.Rollback() // preserve the original migration error
		return fmt.Errorf("record migration %q: %w", migrationName, err)
	}
	if err := transaction.Commit(); err != nil {
		return fmt.Errorf("commit migration %q: %w", migrationName, err)
	}
	return nil
}

func migrationApplied(database *sql.DB, migrationName string) (bool, error) {
	var foundName string
	err := database.QueryRow(`SELECT name FROM _migrations WHERE name = ?`, migrationName).Scan(&foundName)
	if err == sql.ErrNoRows {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("check migration %q: %w", migrationName, err)
	}
	return true, nil
}

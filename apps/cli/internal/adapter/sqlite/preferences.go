package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

// ErrInvalidStoredPreference reports corrupt JSON without changing stored bytes.
// Callers can recover by replacing the value with a normal Set.
var ErrInvalidStoredPreference = errors.New("stored preference is not valid JSON; replace it to recover")

// Preference distinguishes an absent entry from a stored JSON null.
// Value is opaque: reads validate JSON syntax but never interpret or repair payloads.
type Preference struct {
	Found bool            `json:"found"`
	Value json.RawMessage `json:"value,omitempty"`
}

// PreferenceStore persists opaque JSON by the exact (scope, key) pair.
type PreferenceStore struct{ database *sql.DB }

// NewPreferenceStore creates a shared generic preference store.
func NewPreferenceStore(database *sql.DB) *PreferenceStore {
	return &PreferenceStore{database: database}
}

// Get returns missing entries without synthesizing a value.
func (store *PreferenceStore) Get(ctx context.Context, scope, key string) (Preference, error) {
	var raw []byte
	err := store.database.QueryRowContext(ctx, `SELECT value FROM preferences WHERE scope=? AND key=?`, scope, key).Scan(&raw)
	if err == sql.ErrNoRows {
		return Preference{}, nil
	}
	if err != nil {
		return Preference{}, fmt.Errorf("read preference: %w", err)
	}
	return storedPreference(raw)
}

// Set replaces a value, or inserts only if absent. The read remains inside
// the write transaction so initializeOnly returns the stored winner atomically.
// Input validation belongs to the application boundary, not domain parsing.
func (store *PreferenceStore) Set(ctx context.Context, scope, key string, value json.RawMessage, initializeOnly bool) (Preference, error) {
	transaction, err := store.database.BeginTx(ctx, nil)
	if err != nil {
		return Preference{}, fmt.Errorf("begin preference write: %w", err)
	}
	defer transaction.Rollback() // best-effort cleanup after failed write; no-op after commit
	conflict := "DO UPDATE SET value=excluded.value"
	if initializeOnly {
		conflict = "DO NOTHING"
	}
	_, err = transaction.ExecContext(ctx, `INSERT INTO preferences(scope,key,value) VALUES(?,?,?) ON CONFLICT(scope,key) `+conflict, scope, key, string(value))
	if err != nil {
		return Preference{}, fmt.Errorf("write preference: %w", err)
	}
	var raw []byte
	if err := transaction.QueryRowContext(ctx, `SELECT value FROM preferences WHERE scope=? AND key=?`, scope, key).Scan(&raw); err != nil {
		return Preference{}, fmt.Errorf("read stored preference: %w", err)
	}
	stored, err := storedPreference(raw)
	if err != nil {
		return Preference{}, err
	}
	if err := transaction.Commit(); err != nil {
		return Preference{}, fmt.Errorf("commit preference: %w", err)
	}
	return stored, nil
}

func storedPreference(raw []byte) (Preference, error) {
	if !json.Valid(raw) {
		return Preference{}, ErrInvalidStoredPreference
	}
	return Preference{Found: true, Value: json.RawMessage(raw)}, nil
}

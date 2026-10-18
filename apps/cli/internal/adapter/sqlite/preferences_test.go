package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"testing"
)

func TestPreferenceStore_RoundTrip(t *testing.T) {
	database := openTestDB(t).database
	store := NewPreferenceStore(database)
	ctx := context.Background()
	missing, err := store.Get(ctx, "opaque scope", "key")
	if err != nil || missing.Found || missing.Value != nil {
		t.Fatalf("missing = %+v, %v", missing, err)
	}
	for _, raw := range []string{`null`, `false`, `42`, `"text"`, `[]`, ` { "unknown": [null, true], "version": 999 } `} {
		written, err := store.Set(ctx, "opaque scope", "key", json.RawMessage(raw), false)
		if err != nil || !written.Found || string(written.Value) != raw {
			t.Fatalf("write = %+v, %v", written, err)
		}
		loaded, err := store.Get(ctx, "opaque scope", "key")
		if err != nil || !loaded.Found || string(loaded.Value) != raw {
			t.Fatalf("read = %+v, %v", loaded, err)
		}
	}
	for _, pair := range [][2]string{{"other", "key"}, {"opaque scope", "other"}} {
		loaded, err := store.Get(ctx, pair[0], pair[1])
		if err != nil || loaded.Found {
			t.Fatalf("isolation = %+v, %v", loaded, err)
		}
	}
}

func TestPreferenceStore_InitializeOnlyReturnsWinner(t *testing.T) {
	store := NewPreferenceStore(openTestDB(t).database)
	ctx := context.Background()
	var group sync.WaitGroup
	winners := make(chan string, 16)
	for index := 0; index < cap(winners); index++ {
		group.Add(1)
		go func(index int) {
			defer group.Done()
			stored, err := store.Set(ctx, "scope", "key", json.RawMessage(fmt.Sprint(index)), true)
			if err != nil {
				t.Errorf("initialize: %v", err)
				return
			}
			winners <- string(stored.Value)
		}(index)
	}
	group.Wait()
	close(winners)
	stored, err := store.Get(ctx, "scope", "key")
	if err != nil || !stored.Found {
		t.Fatalf("winner = %+v, %v", stored, err)
	}
	for winner := range winners {
		if winner != string(stored.Value) {
			t.Fatalf("winner = %s, stored = %s", winner, stored.Value)
		}
	}
}

func TestPreferenceStore_InitializeOnlyPreservesNull(t *testing.T) {
	store := NewPreferenceStore(openTestDB(t).database)
	ctx := context.Background()
	overwritten, err := store.Set(ctx, "scope", "key", json.RawMessage(`null`), false)
	if err != nil || string(overwritten.Value) != "null" {
		t.Fatalf("overwrite = %+v, %v", overwritten, err)
	}
	retained, err := store.Set(ctx, "scope", "key", json.RawMessage(`123`), true)
	if err != nil || string(retained.Value) != "null" {
		t.Fatalf("retained null = %+v, %v", retained, err)
	}
}

func TestMigrate_023PreservesPreferenceBytes(t *testing.T) {
	database := openPreferenceMigrationDatabase(t)
	mappings := map[string]string{"project_list_preferences:": "project.navigator", "project_filter_preferences:": "project.filter", "task_hub_filter_preferences:": "task.filter"}
	for prefix := range mappings {
		if err := setMetadataKey(context.Background(), database, prefix+"org:opaque", "  {malformed legacy bytes}  "); err != nil {
			t.Fatal(err)
		}
	}
	if err := setMetadataKey(context.Background(), database, "unrelated", "untouched"); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(database); err != nil {
		t.Fatal(err)
	}
	if err := Migrate(database); err != nil {
		t.Fatal(err)
	}
	for prefix, key := range mappings {
		var stored string
		err := database.QueryRow(`SELECT value FROM preferences WHERE scope=? AND key=?`, "org:opaque", key).Scan(&stored)
		if err != nil || stored != "  {malformed legacy bytes}  " {
			t.Fatalf("migrated = %q, %v", stored, err)
		}
		legacy, found, err := getMetadataKey(context.Background(), database, prefix+"org:opaque")
		if err != nil || !found || legacy != stored {
			t.Fatalf("legacy changed = %q, %v", legacy, err)
		}
	}
	legacy, found, err := getMetadataKey(context.Background(), database, "unrelated")
	if err != nil || !found || legacy != "untouched" {
		t.Fatalf("unrelated = %q, %v", legacy, err)
	}
}

func openPreferenceMigrationDatabase(t *testing.T) *sql.DB {
	t.Helper()
	database := openMigrationTestDatabase(t)
	if _, err := database.Exec(`CREATE TABLE _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`); err != nil {
		t.Fatal(err)
	}
	names, err := migrationNames()
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range names {
		if name < "023" {
			if err := applyMigration(database, name); err != nil {
				t.Fatal(err)
			}
		}
	}
	return database
}

func TestPreferenceStore_MigratedValueSerialization(t *testing.T) {
	for _, raw := range []string{`{malformed}`, ``, `  `, ` null `} {
		t.Run(fmt.Sprintf("value=%q", raw), func(t *testing.T) {
			database := openPreferenceMigrationDatabase(t)
			ctx := context.Background()
			if err := setMetadataKey(ctx, database, "project_list_preferences:scope", raw); err != nil {
				t.Fatal(err)
			}
			if err := Migrate(database); err != nil {
				t.Fatal(err)
			}
			store := NewPreferenceStore(database)
			for _, initialize := range []bool{false, true} {
				var result Preference
				var err error
				if initialize {
					result, err = store.Set(ctx, "scope", "project.navigator", json.RawMessage(`123`), true)
				} else {
					result, err = store.Get(ctx, "scope", "project.navigator")
				}
				assertMigratedPreferenceResult(t, raw, result, err)
			}
			var stored string
			if err := database.QueryRow(`SELECT value FROM preferences WHERE scope=? AND key=?`, "scope", "project.navigator").Scan(&stored); err != nil || stored != raw {
				t.Fatalf("stored bytes changed: %q, %v", stored, err)
			}
			if _, err := store.Set(ctx, "scope", "project.navigator", json.RawMessage(`true`), false); err != nil {
				t.Fatalf("replace corrupt value: %v", err)
			}
		})
	}
}

func assertMigratedPreferenceResult(t *testing.T, raw string, result Preference, err error) {
	t.Helper()
	if !json.Valid([]byte(raw)) {
		if !errors.Is(err, ErrInvalidStoredPreference) || result.Found || result.Value != nil {
			t.Fatalf("corrupt value returned as success: %+v, %v", result, err)
		}
		return
	}
	if err != nil || !result.Found || string(result.Value) != raw {
		t.Fatalf("valid value changed: %+v, %v", result, err)
	}
	encoded, err := json.Marshal(result)
	if err != nil || string(encoded) != `{"found":true,"value":null}` {
		t.Fatalf("serialized result = %s, %v", encoded, err)
	}
}

package db

import (
	"context"
	"testing"
)

func TestRemoteToLocalMigrationComplete_RequiresSingleKey(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}

	complete, err := RemoteToLocalMigrationComplete(context.Background(), database)
	if err != nil {
		t.Fatalf("RemoteToLocalMigrationComplete: %v", err)
	}
	if complete {
		t.Fatal("expected migration to be incomplete before any marker is set")
	}

	// Any version satisfies the status check (an upgraded binary on a profile
	// migrated under an older version still reports complete).
	if err := setMetadataKey(context.Background(), database, RemoteToLocalMigrationCompletedKey, "v0"); err != nil {
		t.Fatalf("set migration marker: %v", err)
	}
	complete, err = RemoteToLocalMigrationComplete(context.Background(), database)
	if err != nil {
		t.Fatalf("RemoteToLocalMigrationComplete: %v", err)
	}
	if !complete {
		t.Fatal("expected migration marker to satisfy status")
	}
}

func TestRemoteToLocalMigrationComplete_IgnoresLegacyMarkers(t *testing.T) {
	database, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer database.Close()
	if err := Migrate(database); err != nil {
		t.Fatalf("migrate database: %v", err)
	}
	for _, key := range legacyRemoteToLocalMarkerKeys {
		if err := setMetadataKey(context.Background(), database, key, "true"); err != nil {
			t.Fatalf("set legacy migration marker %q: %v", key, err)
		}
	}

	complete, err := RemoteToLocalMigrationComplete(context.Background(), database)
	if err != nil {
		t.Fatalf("RemoteToLocalMigrationComplete: %v", err)
	}
	if complete {
		t.Fatal("expected legacy migration markers not to satisfy status")
	}
}

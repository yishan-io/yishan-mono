package daemon

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLoadState_AllowsRunningCurrentProcess(t *testing.T) {
	statePath := filepath.Join(t.TempDir(), StateFileName)
	state := RuntimeState{
		PID:       os.Getpid(),
		Host:      "127.0.0.1",
		Port:      43123,
		StartedAt: time.Now().UTC(),
	}
	if err := saveState(statePath, state); err != nil {
		t.Fatalf("save state: %v", err)
	}

	loadedState, err := LoadState(statePath)
	if err != nil {
		t.Fatalf("load state: %v", err)
	}
	if loadedState.PID != state.PID || loadedState.Port != state.Port || loadedState.Host != state.Host {
		t.Fatalf("unexpected loaded state: %+v", loadedState)
	}
}

func TestLoadState_RemovesStaleStateFileForDeadProcess(t *testing.T) {
	statePath := filepath.Join(t.TempDir(), StateFileName)
	state := RuntimeState{
		PID:       999999,
		Host:      "127.0.0.1",
		Port:      43123,
		StartedAt: time.Now().UTC(),
	}
	if err := saveState(statePath, state); err != nil {
		t.Fatalf("save state: %v", err)
	}

	_, err := LoadState(statePath)
	if !os.IsNotExist(err) {
		t.Fatalf("expected stale state to return not-exist, got %v", err)
	}
	if _, statErr := os.Stat(statePath); !os.IsNotExist(statErr) {
		t.Fatalf("expected stale state file removed, got err=%v", statErr)
	}
}

func TestRemoveOwnedState_RemovesOnlyOwnedState(t *testing.T) {
	statePath := filepath.Join(t.TempDir(), StateFileName)

	// State records a different daemon's pid (e.g. a twin that took over the
	// profile before this one exited) — the file must be left in place.
	other := RuntimeState{
		PID:       999999,
		Host:      "127.0.0.1",
		Port:      43123,
		StartedAt: time.Now().UTC(),
	}
	if err := saveState(statePath, other); err != nil {
		t.Fatalf("save state: %v", err)
	}
	removeOwnedState(statePath, os.Getpid())
	if _, err := os.Stat(statePath); err != nil {
		t.Fatalf("state belonging to another daemon was removed: %v", err)
	}

	// State records this process's pid — removed.
	owned := RuntimeState{
		PID:       os.Getpid(),
		Host:      "127.0.0.1",
		Port:      43124,
		StartedAt: time.Now().UTC(),
	}
	if err := saveState(statePath, owned); err != nil {
		t.Fatalf("save state: %v", err)
	}
	removeOwnedState(statePath, os.Getpid())
	if _, err := os.Stat(statePath); !os.IsNotExist(err) {
		t.Fatalf("owned state file not removed: %v", err)
	}
}

func TestRemoveOwnedState_MissingFileIsNoOp(t *testing.T) {
	removeOwnedState(filepath.Join(t.TempDir(), StateFileName), os.Getpid()) // must not error
}

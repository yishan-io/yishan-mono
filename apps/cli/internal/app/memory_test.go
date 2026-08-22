package app

import (
	"os"
	"path/filepath"
	"testing"

	"yishan/apps/cli/internal/memory"
)

func TestInitMemory_MigratesOldDB(t *testing.T) {
	root := t.TempDir()
	oldPath := filepath.Join(root, "memory.db")
	newPath := filepath.Join(root, "memory", "memory.db")

	db, err := memory.OpenDB(oldPath)
	if err != nil {
		t.Fatalf("OpenDB oldPath: %v", err)
	}
	db.Close()

	_ = initMemoryService(root, memory.SummarizerConfig{}, "")

	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Fatal("expected old memory.db to be moved away")
	}
	if _, err := os.Stat(newPath); err != nil {
		t.Fatalf("expected new memory/memory.db to exist: %v", err)
	}
}

func TestInitMemory_NewPathOnly(t *testing.T) {
	root := t.TempDir()
	oldPath := filepath.Join(root, "memory.db")
	newPath := filepath.Join(root, "memory", "memory.db")

	_ = initMemoryService(root, memory.SummarizerConfig{}, "")

	if _, err := os.Stat(oldPath); !os.IsNotExist(err) {
		t.Fatal("expected old memory.db to not exist")
	}
	if _, err := os.Stat(newPath); err != nil {
		t.Fatalf("expected new memory/memory.db to exist: %v", err)
	}
}

func TestInitMemory_BothExistKeepsOld(t *testing.T) {
	root := t.TempDir()
	oldPath := filepath.Join(root, "memory.db")
	newPath := filepath.Join(root, "memory", "memory.db")

	db, err := memory.OpenDB(newPath)
	if err != nil {
		t.Fatalf("OpenDB newPath: %v", err)
	}
	db.Close()

	if err := os.WriteFile(oldPath, []byte("old-db"), 0o600); err != nil {
		t.Fatalf("WriteFile oldPath: %v", err)
	}

	_ = initMemoryService(root, memory.SummarizerConfig{}, "")

	data, err := os.ReadFile(oldPath)
	if err != nil {
		t.Fatalf("expected old memory.db to still exist: %v", err)
	}
	if string(data) != "old-db" {
		t.Fatalf("expected old db unchanged, got %q", string(data))
	}
	if _, err := os.Stat(newPath); err != nil {
		t.Fatalf("expected new memory/memory.db to exist: %v", err)
	}
}

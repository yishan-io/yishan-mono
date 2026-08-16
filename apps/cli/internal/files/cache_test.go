package files

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFileServiceListUsesCachedDirectoryEntriesUntilInvalidated(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()

	if err := os.WriteFile(filepath.Join(root, "a.txt"), []byte("a"), 0o644); err != nil {
		t.Fatalf("seed file: %v", err)
	}

	entries, err := svc.List(root, "", false)
	if err != nil {
		t.Fatalf("initial list: %v", err)
	}
	if len(entries) != 1 || entries[0].Path != "a.txt" {
		t.Fatalf("unexpected initial entries: %+v", entries)
	}

	if err := os.WriteFile(filepath.Join(root, "b.txt"), []byte("b"), 0o644); err != nil {
		t.Fatalf("write uncached file: %v", err)
	}

	entries, err = svc.List(root, "", false)
	if err != nil {
		t.Fatalf("cached list: %v", err)
	}
	if len(entries) != 1 || entries[0].Path != "a.txt" {
		t.Fatalf("expected cached entries before invalidation, got %+v", entries)
	}

	svc.InvalidateWorkspacePaths(root, []string{"b.txt"})
	entries, err = svc.List(root, "", false)
	if err != nil {
		t.Fatalf("list after invalidation: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("expected refreshed entries after invalidation, got %+v", entries)
	}
}

func TestFileService_DoesNotStoreDirectoryEntriesAfterInvalidation(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()

	_, isCached, generation := svc.cachedDirectoryEntries(root, "")
	if isCached {
		t.Fatal("expected an empty cache")
	}

	svc.InvalidateWorkspacePaths(root, []string{""})
	svc.storeCachedDirectoryEntries(root, "", []FileEntry{{Path: "stale.txt"}}, generation)

	_, isCached, _ = svc.cachedDirectoryEntries(root, "")
	if isCached {
		t.Fatal("stale directory entries were stored after invalidation")
	}
}

func TestFileServiceWriteInvalidatesParentDirectoryCache(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()

	if err := svc.Mkdir(root, "dir", true, 0); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if _, err := svc.List(root, "dir", false); err != nil {
		t.Fatalf("prime cache: %v", err)
	}

	if _, err := svc.Write(root, "dir/new.txt", "hello", 0); err != nil {
		t.Fatalf("write: %v", err)
	}

	entries, err := svc.List(root, "dir", false)
	if err != nil {
		t.Fatalf("list after write: %v", err)
	}
	if len(entries) != 1 || entries[0].Path != "dir/new.txt" {
		t.Fatalf("expected refreshed directory entries after write, got %+v", entries)
	}
}

func TestFileServiceMoveInvalidatesSourceAndDestinationCaches(t *testing.T) {
	root := t.TempDir()
	svc := NewFileService()

	if err := svc.Mkdir(root, "from", true, 0); err != nil {
		t.Fatalf("mkdir from: %v", err)
	}
	if err := svc.Mkdir(root, "to", true, 0); err != nil {
		t.Fatalf("mkdir to: %v", err)
	}
	if _, err := svc.Write(root, "from/item.txt", "hello", 0); err != nil {
		t.Fatalf("write seed: %v", err)
	}
	if _, err := svc.List(root, "from", false); err != nil {
		t.Fatalf("prime from cache: %v", err)
	}
	if _, err := svc.List(root, "to", false); err != nil {
		t.Fatalf("prime to cache: %v", err)
	}

	if err := svc.Move(root, "from/item.txt", "to/item.txt"); err != nil {
		t.Fatalf("move: %v", err)
	}

	fromEntries, err := svc.List(root, "from", false)
	if err != nil {
		t.Fatalf("list from after move: %v", err)
	}
	if len(fromEntries) != 0 {
		t.Fatalf("expected empty source dir after move, got %+v", fromEntries)
	}

	toEntries, err := svc.List(root, "to", false)
	if err != nil {
		t.Fatalf("list to after move: %v", err)
	}
	if len(toEntries) != 1 || toEntries[0].Path != "to/item.txt" {
		t.Fatalf("expected destination file after move, got %+v", toEntries)
	}
}

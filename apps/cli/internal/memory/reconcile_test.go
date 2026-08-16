package memory

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReconcile_InsertNewFiles(t *testing.T) {
	db := openTestDB(t)
	worktree := t.TempDir()
	ctxDir := filepath.Join(worktree, ".my-context")
	if err := os.MkdirAll(ctxDir, 0o755); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(ctxDir, "MEMORY.md"), []byte("# Memory\n"), 0o644)
	os.WriteFile(filepath.Join(ctxDir, "notes.md"), []byte("# Notes\n"), 0o644)

	result, err := db.Reconcile([]WorkspaceRef{{WorktreePath: worktree, ProjectID: "p1"}}, "")
	if err != nil {
		t.Fatal(err)
	}
	if result.Inserted != 2 {
		t.Errorf("expected 2 inserted, got %d", result.Inserted)
	}
	if result.Updated != 0 || result.Deleted != 0 {
		t.Errorf("unexpected updated=%d deleted=%d", result.Updated, result.Deleted)
	}
}

func TestReconcile_UpdateChangedFile(t *testing.T) {
	db := openTestDB(t)
	worktree := t.TempDir()
	ctxDir := filepath.Join(worktree, ".my-context")
	os.MkdirAll(ctxDir, 0o755)
	memPath := filepath.Join(ctxDir, "MEMORY.md")
	os.WriteFile(memPath, []byte("v1"), 0o644)

	db.Reconcile([]WorkspaceRef{{WorktreePath: worktree}}, "")

	// Change content.
	os.WriteFile(memPath, []byte("v2 updated"), 0o644)
	result, err := db.Reconcile([]WorkspaceRef{{WorktreePath: worktree}}, "")
	if err != nil {
		t.Fatal(err)
	}
	if result.Updated != 1 {
		t.Errorf("expected 1 updated, got %d", result.Updated)
	}
}

func TestReconcile_DeleteRemovedFile(t *testing.T) {
	db := openTestDB(t)
	worktree := t.TempDir()
	ctxDir := filepath.Join(worktree, ".my-context")
	os.MkdirAll(ctxDir, 0o755)
	deletedPath := filepath.Join(ctxDir, "todelete.md")
	os.WriteFile(deletedPath, []byte("will be deleted"), 0o644)
	os.WriteFile(filepath.Join(ctxDir, "keep.md"), []byte("keep"), 0o644)

	db.Reconcile([]WorkspaceRef{{WorktreePath: worktree}}, "")

	os.Remove(deletedPath)

	result, err := db.Reconcile([]WorkspaceRef{{WorktreePath: worktree}}, "")
	if err != nil {
		t.Fatal(err)
	}
	if result.Deleted != 1 {
		t.Errorf("expected 1 deleted, got %d", result.Deleted)
	}

	_, found, _ := db.GetByPath(deletedPath)
	if found {
		t.Error("deleted file should not be in DB")
	}
}

func TestReconcile_SkipUnchanged(t *testing.T) {
	db := openTestDB(t)
	worktree := t.TempDir()
	ctxDir := filepath.Join(worktree, ".my-context")
	os.MkdirAll(ctxDir, 0o755)
	os.WriteFile(filepath.Join(ctxDir, "MEMORY.md"), []byte("unchanged"), 0o644)

	db.Reconcile([]WorkspaceRef{{WorktreePath: worktree}}, "")

	result, err := db.Reconcile([]WorkspaceRef{{WorktreePath: worktree}}, "")
	if err != nil {
		t.Fatal(err)
	}
	if result.Inserted != 0 || result.Updated != 0 || result.Deleted != 0 {
		t.Errorf("expected all zeros on second reconcile of unchanged files, got %+v", result)
	}
}

func TestReconcile_ClassifiesTypes(t *testing.T) {
	db := openTestDB(t)
	worktree := t.TempDir()
	ctxDir := filepath.Join(worktree, ".my-context")
	os.MkdirAll(filepath.Join(ctxDir, "architecture"), 0o755)
	os.MkdirAll(filepath.Join(ctxDir, "archive"), 0o755)
	os.MkdirAll(filepath.Join(ctxDir, "tasks", "t001"), 0o755)
	os.MkdirAll(filepath.Join(ctxDir, "future-improvement"), 0o755)

	os.WriteFile(filepath.Join(ctxDir, "MEMORY.md"), []byte("memory"), 0o644)
	os.WriteFile(filepath.Join(ctxDir, "architecture", "decisions.md"), []byte("arch"), 0o644)
	os.WriteFile(filepath.Join(ctxDir, "archive", "decisions-20260614.md"), []byte("overflow"), 0o644)
	os.WriteFile(filepath.Join(ctxDir, "tasks", "t001", "plan.md"), []byte("task"), 0o644)
	os.WriteFile(filepath.Join(ctxDir, "future-improvement", "idea.md"), []byte("future"), 0o644)

	db.Reconcile([]WorkspaceRef{{WorktreePath: worktree, ProjectID: "p1"}}, "")

	// resolveContextRoot returns ctxDir directly since it's a real dir (not a symlink) in tests.
	ctxRoot := resolveContextRoot(worktree)
	if ctxRoot == "" {
		t.Fatal("resolveContextRoot returned empty for test worktree")
	}

	cases := []struct {
		relPath string
		want    fileType
	}{
		{"MEMORY.md", FileTypeMemory},
		{filepath.Join("architecture", "decisions.md"), FileTypeArchitecture},
		{filepath.Join("archive", "decisions-20260614.md"), FileTypeArchive},
		{filepath.Join("tasks", "t001", "plan.md"), FileTypeTask},
		{filepath.Join("future-improvement", "idea.md"), FileTypeFuture},
	}

	for _, tc := range cases {
		fullPath := filepath.Join(ctxRoot, tc.relPath)
		f, found, err := db.GetByPath(fullPath)
		if err != nil || !found {
			t.Errorf("file %q not found: err=%v", fullPath, err)
			continue
		}
		if f.Type != tc.want {
			t.Errorf("file %q: type=%q, want %q", fullPath, f.Type, tc.want)
		}
	}
}

func TestReconcile_GlobalDir(t *testing.T) {
	db := openTestDB(t)
	globalDir := t.TempDir()
	globalMemPath := filepath.Join(globalDir, "MEMORY.md")
	os.WriteFile(globalMemPath, []byte("global memory"), 0o644)

	result, err := db.Reconcile(nil, globalDir)
	if err != nil {
		t.Fatal(err)
	}
	if result.Inserted != 1 {
		t.Errorf("expected 1 global file inserted, got %d", result.Inserted)
	}

	f, found, _ := db.GetByPath(globalMemPath)
	if !found {
		t.Fatal("global file not found in DB")
	}
	if f.Type != FileTypeGlobal {
		t.Errorf("expected FileTypeGlobal, got %q", f.Type)
	}
	if f.ProjectID != "" {
		t.Errorf("expected empty projectID for global, got %q", f.ProjectID)
	}
}

// ── IndexFileOnDisk ───────────────────────────────────────────────────────────

func TestIndexFileOnDisk_NewFile(t *testing.T) {
	db := openTestDB(t)
	ctxDir := t.TempDir()
	p := filepath.Join(ctxDir, "MEMORY.md")
	os.WriteFile(p, []byte("# Memory"), 0o644)

	if err := db.IndexFileOnDisk(p, ctxDir, "proj-1"); err != nil {
		t.Fatal(err)
	}

	f, found, _ := db.GetByPath(p)
	if !found {
		t.Fatal("file not in DB after IndexFileOnDisk")
	}
	if f.ProjectID != "proj-1" {
		t.Errorf("expected proj-1, got %q", f.ProjectID)
	}
}

func TestIndexFileOnDisk_DeletesOnNotExist(t *testing.T) {
	db := openTestDB(t)
	p := "/nonexistent/MEMORY.md"
	db.UpsertFile(memoryFile{Path: p, ProjectPath: "/nonexistent", Type: FileTypeMemory, Body: "x", Fingerprint: "fp", IndexedAt: 1})

	if err := db.IndexFileOnDisk(p, "/nonexistent", "p1"); err != nil {
		t.Fatal(err)
	}
	_, found, _ := db.GetByPath(p)
	if found {
		t.Error("file should be deleted when not on disk")
	}
}

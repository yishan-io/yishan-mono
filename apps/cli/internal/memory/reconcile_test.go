package memory

import (
	"os"
	"path/filepath"
	"testing"
)

// ── classifyFileType ──────────────────────────────────────────────────────────

func TestClassifyFileType(t *testing.T) {
	root := "/home/user/.yishan/contexts/my-repo"

	cases := []struct {
		absPath string
		want    FileType
	}{
		// Files directly under context root → memory
		{root + "/MEMORY.md", FileTypeMemory},
		{root + "/notes.md", FileTypeMemory},
		// architecture subdir
		{root + "/architecture/decisions.md", FileTypeArchitecture},
		{root + "/architecture/deep/nested.md", FileTypeArchitecture},
		// archive subdir
		{root + "/archive/decisions-20260614.md", FileTypeArchive},
		{root + "/archive/learned-20260614.md", FileTypeArchive},
		// tasks subdir
		{root + "/tasks/t001/plan.md", FileTypeTask},
		// future-improvement subdir
		{root + "/future-improvement/idea.md", FileTypeFuture},
		// unknown subdir → memory
		{root + "/custom/foo.md", FileTypeMemory},
		// empty contextRoot → global
		{"/some/path/MEMORY.md", FileTypeGlobal},
		// path outside contextRoot → global
		{"/other/path/MEMORY.md", FileTypeGlobal},
	}

	for _, tc := range cases {
		ctxRoot := root
		if tc.want == FileTypeGlobal && tc.absPath != root+"/MEMORY.md" {
			ctxRoot = ""
		}
		got := classifyFileType(tc.absPath, ctxRoot)
		if got != tc.want {
			t.Errorf("classifyFileType(%q, %q) = %q; want %q", tc.absPath, ctxRoot, got, tc.want)
		}
	}
}

func TestClassifyFileTypeEmptyContextRoot(t *testing.T) {
	got := classifyFileType("/anything/MEMORY.md", "")
	if got != FileTypeGlobal {
		t.Errorf("want FileTypeGlobal for empty contextRoot, got %q", got)
	}
}

// ── resolveContextRoot ────────────────────────────────────────────────────────

func TestResolveContextRoot_RealDir(t *testing.T) {
	worktree := t.TempDir()
	ctxDir := filepath.Join(worktree, ".my-context")
	if err := os.MkdirAll(ctxDir, 0o755); err != nil {
		t.Fatal(err)
	}

	// EvalSymlinks resolves /var → /private/var on macOS; normalise the expected value.
	wantCtxDir, _ := filepath.EvalSymlinks(ctxDir)
	if wantCtxDir == "" {
		wantCtxDir = ctxDir
	}

	got := resolveContextRoot(worktree)
	if got != wantCtxDir {
		t.Errorf("want %q, got %q", wantCtxDir, got)
	}
}

func TestResolveContextRoot_Symlink(t *testing.T) {
	canonical := t.TempDir()
	worktree := t.TempDir()
	linkPath := filepath.Join(worktree, ".my-context")

	if err := os.Symlink(canonical, linkPath); err != nil {
		t.Fatal(err)
	}

	// EvalSymlinks also resolves /tmp → /private/tmp on macOS.
	wantCanonical, _ := filepath.EvalSymlinks(canonical)

	got := resolveContextRoot(worktree)
	if got != wantCanonical {
		t.Errorf("want canonical %q, got %q", wantCanonical, got)
	}
}

func TestResolveContextRoot_Missing(t *testing.T) {
	worktree := t.TempDir()
	got := resolveContextRoot(worktree)
	if got != "" {
		t.Errorf("want empty string for missing .my-context, got %q", got)
	}
}

// ── fingerprint ───────────────────────────────────────────────────────────────

func TestFingerprint(t *testing.T) {
	a := fingerprint([]byte("hello"))
	b := fingerprint([]byte("hello"))
	c := fingerprint([]byte("world"))

	if a != b {
		t.Error("same content should produce same fingerprint")
	}
	if a == c {
		t.Error("different content should produce different fingerprint")
	}
	if a == "" {
		t.Error("fingerprint should not be empty")
	}
	// Must be deterministic length (8 hex bytes = 16 chars)
	if len(a) != 16 {
		t.Errorf("expected 16-char fingerprint, got len=%d", len(a))
	}
}

func TestFingerprint_EmptyInput(t *testing.T) {
	fp := fingerprint([]byte{})
	if fp == "" {
		t.Error("fingerprint of empty body should not be empty")
	}
}
